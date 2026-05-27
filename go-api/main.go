package main

import (
    "encoding/json"
    "net/http"
    "strings"

    "github.com/golang-jwt/jwt/v5"
)

func healthHandler(w http.ResponseWriter, r *http.Request) {
    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func loginHandler(w http.ResponseWriter, r *http.Request) {
    if r.Method != http.MethodPost {
        notFoundHandler(w, r)
        return
    }

    var body map[string]string
    if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
        body = map[string]string{}
    }

    if body["email"] != "admin@example.com" || body["password"] != "secret" {
        w.Header().Set("Content-Type", "application/json")
        w.WriteHeader(http.StatusUnauthorized)
        json.NewEncoder(w).Encode(map[string]any{
            "error": map[string]string{"code": "invalid_credentials"},
        })
        return
    }

    token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
        "sub":   "1",
        "email": "admin@example.com",
    })

    tokenString, err := token.SignedString([]byte("secret"))
    if err != nil {
        w.Header().Set("Content-Type", "application/json")
        w.WriteHeader(http.StatusInternalServerError)
        json.NewEncoder(w).Encode(map[string]any{
            "error": map[string]string{"code": "internal_error"},
        })
        return
    }

    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(map[string]any{
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
        w.Header().Set("Content-Type", "application/json")
        w.WriteHeader(http.StatusUnauthorized)
        json.NewEncoder(w).Encode(map[string]any{
            "error": map[string]string{"code": "missing_token"},
        })
        return
    }

    tokenString := strings.TrimPrefix(auth, "Bearer ")
    token, err := jwt.Parse(tokenString, func(token *jwt.Token) (any, error) {
        return []byte("secret"), nil
    })

    if err != nil || !token.Valid {
        w.Header().Set("Content-Type", "application/json")
        w.WriteHeader(http.StatusUnauthorized)
        json.NewEncoder(w).Encode(map[string]any{
            "error": map[string]string{"code": "invalid_token"},
        })
        return
    }

    claims := token.Claims.(jwt.MapClaims)
    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(map[string]any{
        "data": map[string]any{
            "id":    1,
            "email": claims["email"],
        },
    })
}

func notFoundHandler(w http.ResponseWriter, r *http.Request) {
    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(http.StatusNotFound)
    json.NewEncoder(w).Encode(map[string]any{
        "error": map[string]string{"code": "endpoint_not_found"},
    })
}

func main() {
    mux := http.NewServeMux()
    mux.HandleFunc("GET /health", healthHandler)
    mux.HandleFunc("POST /auth/login", loginHandler)
    mux.HandleFunc("GET /me", meHandler)
    mux.HandleFunc("/", notFoundHandler)
    http.ListenAndServe(":3000", mux)
}
