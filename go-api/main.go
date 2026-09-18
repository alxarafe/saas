package main

import (
    "database/sql"
    "encoding/json"
    "errors"
    "fmt"
    "net/http"
    "os"
    "strconv"
    "strings"
    "time"

    "github.com/jackc/pgx/v5/pgconn"
    _ "github.com/jackc/pgx/v5/stdlib"

    "github.com/golang-jwt/jwt/v5"
)

var db *sql.DB

func env(name, fallback string) string {
    if v := os.Getenv(name); v != "" {
        return v
    }
    return fallback
}

func healthHandler(w http.ResponseWriter, r *http.Request) {
    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func writeJSON(w http.ResponseWriter, status int, body map[string]any) {
    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(status)
    json.NewEncoder(w).Encode(body)
}

func writeError(w http.ResponseWriter, status int, code string) {
    writeJSON(w, status, map[string]any{
        "error": map[string]string{"code": code},
    })
}

func validationResponse(details []map[string]string) map[string]any {
    return map[string]any{
        "error": map[string]any{"code": "validation_error", "details": details},
    }
}

func isUniqueViolation(err error) bool {
    var pgErr *pgconn.PgError
    return errors.As(err, &pgErr) && pgErr.Code == "23505"
}

func loginHandler(w http.ResponseWriter, r *http.Request) {
    if r.Method != http.MethodPost {
        notFoundHandler(w, r)
        return
    }

    var body map[string]any
    if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body == nil {
        writeError(w, http.StatusBadRequest, "bad_request")
        return
    }

    details := []map[string]string{}
    for _, field := range []string{"email", "password"} {
        value, ok := body[field]
        if !ok || value == nil || value == "" {
            details = append(details, map[string]string{"field": field, "code": "required"})
        } else if _, ok := value.(string); !ok {
            details = append(details, map[string]string{"field": field, "code": "invalid_type"})
        }
    }
    if len(details) > 0 {
        writeJSON(w, http.StatusUnprocessableEntity, validationResponse(details))
        return
    }

    if body["email"] != "admin@example.com" || body["password"] != "secret" {
        writeError(w, http.StatusUnauthorized, "invalid_credentials")
        return
    }

    token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
        "sub":   "1",
        "email": "admin@example.com",
    })

    tokenString, err := token.SignedString([]byte("secret"))
    if err != nil {
        writeError(w, http.StatusInternalServerError, "internal_error")
        return
    }

    writeJSON(w, http.StatusOK, map[string]any{
        "data": map[string]string{"token": tokenString},
    })
}

func meHandler(w http.ResponseWriter, r *http.Request) {
    if r.Method != http.MethodGet {
        notFoundHandler(w, r)
        return
    }

    auth := r.Header.Get("Authorization")

    if auth == "" || !strings.HasPrefix(auth, "Bearer ") {
        writeError(w, http.StatusUnauthorized, "missing_token")
        return
    }

    tokenString := strings.TrimPrefix(auth, "Bearer ")
    token, err := jwt.Parse(tokenString, func(token *jwt.Token) (any, error) {
        return []byte("secret"), nil
    })

    if err != nil || !token.Valid {
        writeError(w, http.StatusUnauthorized, "invalid_token")
        return
    }

    claims := token.Claims.(jwt.MapClaims)
    writeJSON(w, http.StatusOK, map[string]any{
        "data": map[string]any{
            "id":    1,
            "email": claims["email"],
        },
    })
}

func createUsersBulkHandler(w http.ResponseWriter, r *http.Request) {
    if r.Method != http.MethodPost {
        notFoundHandler(w, r)
        return
    }

    var body map[string]any
    if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body == nil {
        writeError(w, http.StatusBadRequest, "bad_request")
        return
    }

    data, ok := body["data"].([]any)
    if !ok {
        writeJSON(w, http.StatusUnprocessableEntity, validationResponse([]map[string]string{
            {"field": "data", "code": "invalid_type"},
        }))
        return
    }

    type user struct{ email, passwordHash string }
    users := []user{}
    details := []map[string]string{}
    for i, item := range data {
        obj, ok := item.(map[string]any)
        if !ok {
            details = append(details, map[string]string{
                "field": fmt.Sprintf("data[%d]", i), "code": "invalid_type",
            })
            continue
        }
        valid := true
        for _, field := range []string{"email", "password_hash"} {
            value, present := obj[field]
            if !present || value == nil || value == "" {
                details = append(details, map[string]string{
                    "field": fmt.Sprintf("data[%d].%s", i, field), "code": "required",
                })
                valid = false
            } else if _, ok := value.(string); !ok {
                details = append(details, map[string]string{
                    "field": fmt.Sprintf("data[%d].%s", i, field), "code": "invalid_type",
                })
                valid = false
            }
        }
        if valid {
            users = append(users, user{email: obj["email"].(string), passwordHash: obj["password_hash"].(string)})
        }
    }
    if len(details) > 0 {
        writeJSON(w, http.StatusUnprocessableEntity, validationResponse(details))
        return
    }
    if len(users) == 0 {
        writeJSON(w, http.StatusUnprocessableEntity, validationResponse([]map[string]string{
            {"field": "data", "code": "required"},
        }))
        return
    }

    tx, err := db.Begin()
    if err != nil {
        writeError(w, http.StatusInternalServerError, "internal_error")
        return
    }
    created := []map[string]any{}
    for _, u := range users {
        var id int64
        var email string
        var createdAt time.Time
        err = tx.QueryRow(
            "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, created_at",
            u.email, u.passwordHash,
        ).Scan(&id, &email, &createdAt)
        if err != nil {
            tx.Rollback()
            if isUniqueViolation(err) {
                writeError(w, http.StatusConflict, "conflict")
            } else {
                writeError(w, http.StatusInternalServerError, "internal_error")
            }
            return
        }
        created = append(created, map[string]any{
            "id": id, "email": email, "created_at": createdAt.UTC().Format(time.RFC3339),
        })
    }
    if err := tx.Commit(); err != nil {
        writeError(w, http.StatusInternalServerError, "internal_error")
        return
    }

    writeJSON(w, http.StatusCreated, map[string]any{"data": created})
}

func listUsersHandler(w http.ResponseWriter, r *http.Request) {
    if r.Method != http.MethodGet {
        notFoundHandler(w, r)
        return
    }

    q := r.URL.Query()

    limit := 20
    if raw := q.Get("limit"); raw != "" {
        n, err := strconv.Atoi(raw)
        if err != nil {
            writeJSON(w, http.StatusUnprocessableEntity, validationResponse([]map[string]string{
                {"field": "limit", "code": "invalid_type"},
            }))
            return
        }
        limit = n
    }
    offset := 0
    if raw := q.Get("offset"); raw != "" {
        n, err := strconv.Atoi(raw)
        if err != nil {
            writeJSON(w, http.StatusUnprocessableEntity, validationResponse([]map[string]string{
                {"field": "offset", "code": "invalid_type"},
            }))
            return
        }
        offset = n
    }
    if limit < 1 || limit > 100 {
        writeJSON(w, http.StatusUnprocessableEntity, validationResponse([]map[string]string{
            {"field": "limit", "code": "invalid_type"},
        }))
        return
    }
    if offset < 0 {
        writeJSON(w, http.StatusUnprocessableEntity, validationResponse([]map[string]string{
            {"field": "offset", "code": "invalid_type"},
        }))
        return
    }

    var total int64
    if err := db.QueryRow("SELECT COUNT(*) FROM users").Scan(&total); err != nil {
        writeError(w, http.StatusInternalServerError, "internal_error")
        return
    }

    rows, err := db.Query(
        "SELECT id, email, created_at FROM users ORDER BY id LIMIT $1 OFFSET $2",
        limit, offset,
    )
    if err != nil {
        writeError(w, http.StatusInternalServerError, "internal_error")
        return
    }
    defer rows.Close()

    data := []map[string]any{}
    for rows.Next() {
        var id int64
        var email string
        var createdAt time.Time
        if err := rows.Scan(&id, &email, &createdAt); err != nil {
            writeError(w, http.StatusInternalServerError, "internal_error")
            return
        }
        data = append(data, map[string]any{
            "id": id, "email": email, "created_at": createdAt.UTC().Format(time.RFC3339),
        })
    }
    if err := rows.Err(); err != nil {
        writeError(w, http.StatusInternalServerError, "internal_error")
        return
    }

    writeJSON(w, http.StatusOK, map[string]any{
        "data": data,
        "pagination": map[string]any{
            "limit": limit, "offset": offset, "total": total,
        },
    })
}

func notFoundHandler(w http.ResponseWriter, r *http.Request) {
    writeError(w, http.StatusNotFound, "endpoint_not_found")
}

const schema = `
CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
)`

func initSchema() {
    for {
        if _, err := db.Exec(schema); err == nil {
            break
        }
        time.Sleep(2 * time.Second)
    }
}

func main() {
    connStr := fmt.Sprintf(
        "postgres://%s:%s@%s:%s/%s",
        env("DB_USER", "saas"),
        env("DB_PASSWORD", "saas"),
        env("DB_HOST", "postgres"),
        env("DB_PORT", "5432"),
        env("DB_NAME", "saas"),
    )
    var err error
    db, err = sql.Open("pgx", connStr)
    if err != nil {
        panic(err)
    }
    initSchema()

    mux := http.NewServeMux()
    mux.HandleFunc("GET /health", healthHandler)
    mux.HandleFunc("POST /auth/login", loginHandler)
    mux.HandleFunc("GET /me", meHandler)
    mux.HandleFunc("POST /users/bulk", createUsersBulkHandler)
    mux.HandleFunc("GET /users", listUsersHandler)
    mux.HandleFunc("/", notFoundHandler)
    http.ListenAndServe(":3000", mux)
}