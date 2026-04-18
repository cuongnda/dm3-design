package i18n

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/duali/dm3-backend/pkg/httputil"
)

// contextKey is the type for context keys to avoid collisions
type contextKey string

const localeContextKey contextKey = "locale"

// Package-level variables for thread-safe access
var (
	translations = make(map[string]map[string]string)
	mu           sync.RWMutex
	defaultLang  = "en"
	supportedLangs = map[string]bool{
		"en": true,
		"vi": true,
	}
)

// Load loads translation files from the given directory
func Load(localesDir string) error {
	mu.Lock()
	defer mu.Unlock()
	
	for lang := range supportedLangs {
		filePath := filepath.Join(localesDir, lang+".json")
		
		data, err := os.ReadFile(filePath)
		if err != nil {
			return fmt.Errorf("failed to read locale file %s: %w", filePath, err)
		}
		
		var messages map[string]string
		if err := json.Unmarshal(data, &messages); err != nil {
			return fmt.Errorf("failed to parse locale file %s: %w", filePath, err)
		}
		
		translations[lang] = messages
	}
	
	return nil
}

// WithLocale returns a new context with the specified locale
func WithLocale(ctx context.Context, locale string) context.Context {
	// Normalize locale (e.g., "en-US" -> "en")
	if idx := strings.Index(locale, "-"); idx > 0 {
		locale = locale[:idx]
	}
	
	// Use default if not supported
	if !supportedLangs[locale] {
		locale = defaultLang
	}
	
	return context.WithValue(ctx, localeContextKey, locale)
}

// getLocaleFromContext extracts locale from context, returns default if not found
func getLocaleFromContext(ctx context.Context) string {
	if locale, ok := ctx.Value(localeContextKey).(string); ok {
		return locale
	}
	return defaultLang
}

// T translates a key for the given context locale with optional interpolation
func T(ctx context.Context, key string, params ...map[string]string) string {
	mu.RLock()
	defer mu.RUnlock()
	
	locale := getLocaleFromContext(ctx)
	
	// Get translation for locale, fallback to default language
	var message string
	if localeMessages, exists := translations[locale]; exists {
		if msg, exists := localeMessages[key]; exists {
			message = msg
		}
	}
	
	// Fallback to default language if not found
	if message == "" && locale != defaultLang {
		if defaultMessages, exists := translations[defaultLang]; exists {
			if msg, exists := defaultMessages[key]; exists {
				message = msg
			}
		}
	}
	
	// If still no translation found, return the key itself
	if message == "" {
		message = key
	}
	
	// Apply interpolation if params provided
	if len(params) > 0 && len(params[0]) > 0 {
		for k, v := range params[0] {
			message = strings.ReplaceAll(message, "{{"+k+"}}", v)
		}
	}
	
	return message
}

// LocaleMiddleware extracts locale from Accept-Language header and adds it to context
func LocaleMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		locale := defaultLang
		
		// Parse Accept-Language header
		acceptLang := r.Header.Get("Accept-Language")
		if acceptLang != "" {
			// Simple parsing - take first preference
			parts := strings.Split(acceptLang, ",")
			if len(parts) > 0 {
				lang := strings.TrimSpace(parts[0])
				// Remove quality factor if present (e.g., "en;q=0.9")
				if idx := strings.Index(lang, ";"); idx > 0 {
					lang = lang[:idx]
				}
				// Normalize to lowercase
				lang = strings.ToLower(lang)
				// Extract language code (e.g., "en-US" -> "en")
				if idx := strings.Index(lang, "-"); idx > 0 {
					lang = lang[:idx]
				}
				
				// Use if supported
				if supportedLangs[lang] {
					locale = lang
				}
			}
		}
		
		ctx := WithLocale(r.Context(), locale)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// ErrorResponse sends an i18n-aware error response
func ErrorResponse(w http.ResponseWriter, r *http.Request, status int, key string, params ...map[string]string) {
	message := T(r.Context(), key, params...)
	
	response := struct {
		Error   string `json:"error"`
		Message string `json:"message"`
	}{
		Error:   key,
		Message: message,
	}
	
	httputil.JSON(w, status, response)
}