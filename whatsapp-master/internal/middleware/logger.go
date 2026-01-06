package middleware

import (
	"bytes"
	"io"
	"log"
	"time"

	"github.com/gin-gonic/gin"
)

// RequestLogger 记录请求和响应日志的中间件
func RequestLogger() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Start time
		startTime := time.Now()

		// Read body
		var bodyBytes []byte
		if c.Request.Body != nil {
			bodyBytes, _ = io.ReadAll(c.Request.Body)
			c.Request.Body = io.NopCloser(bytes.NewBuffer(bodyBytes))
		}

		// Custom ResponseWriter to capture response
		blw := &bodyLogWriter{body: bytes.NewBufferString(""), ResponseWriter: c.Writer}
		c.Writer = blw

		// Process request
		c.Next()

		// Log details
		duration := time.Since(startTime)
		
		// Truncate body if too long for log
		reqBody := string(bodyBytes)
		if len(reqBody) > 1000 {
			reqBody = reqBody[:1000] + "...(truncated)"
		}
		
		respBody := blw.body.String()
		if len(respBody) > 1000 {
			respBody = respBody[:1000] + "...(truncated)"
		}

		log.Printf("\n[API] %d | %13v | %s | %s\n> Req: %s\n< Resp: %s\n",
			c.Writer.Status(),
			duration,
			c.Request.Method,
			c.Request.RequestURI,
			reqBody,
			respBody,
		)
	}
}

type bodyLogWriter struct {
	gin.ResponseWriter
	body *bytes.Buffer
}

func (w bodyLogWriter) Write(b []byte) (int, error) {
	w.body.Write(b)
	return w.ResponseWriter.Write(b)
}
