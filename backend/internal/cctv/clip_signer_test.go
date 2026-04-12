package cctv

import (
	"context"
	"net/url"
	"testing"
	"time"
)

// fakePresigner is a test double for minioPresigner.
type fakePresigner struct {
	returnURL *url.URL
	returnErr error
}

func (f *fakePresigner) PresignedGetObject(_ context.Context, _, _ string, _ time.Duration, _ url.Values) (*url.URL, error) {
	return f.returnURL, f.returnErr
}

func TestObjectStoreClipSigner_Sign_ReturnsNonEmptyURL(t *testing.T) {
	t.Skip("integration — requires live MinIO; unit test uses fake presigner below")
}

func TestObjectStoreClipSigner_Sign_WithFakePresigner(t *testing.T) {
	expected := "https://minio.example.com/dm3/cctv/tenant1/clip.mp4?X-Amz-Signature=abc"
	u, _ := url.Parse(expected)

	signer := &ObjectStoreClipSigner{
		client:     &fakePresigner{returnURL: u},
		bucketName: "dm3",
		expiry:     5 * time.Minute,
	}

	got, err := signer.Sign(context.Background(), "cctv/tenant1/clip.mp4")
	if err != nil {
		t.Fatalf("Sign returned unexpected error: %v", err)
	}
	if got == "" {
		t.Fatal("Sign returned empty URL")
	}
	if got != expected {
		t.Errorf("Sign URL mismatch: got %q, want %q", got, expected)
	}
}

func TestObjectStoreClipSigner_Sign_NilContext_UsesBackground(t *testing.T) {
	u, _ := url.Parse("https://minio.example.com/dm3/clip.mp4")
	signer := &ObjectStoreClipSigner{
		client:     &fakePresigner{returnURL: u},
		bucketName: "dm3",
		expiry:     5 * time.Minute,
	}

	// Pass a non-context value to exercise the fallback path.
	got, err := signer.Sign("not-a-context", "clip.mp4")
	if err != nil {
		t.Fatalf("Sign with non-context value returned error: %v", err)
	}
	if got == "" {
		t.Fatal("Sign returned empty URL")
	}
}

func TestNewObjectStoreClipSigner_MissingEndpoint(t *testing.T) {
	_, err := NewObjectStoreClipSigner("", "key", "secret", "bucket", false)
	if err == nil {
		t.Fatal("expected error for missing endpoint")
	}
}

func TestNewObjectStoreClipSigner_MissingBucket(t *testing.T) {
	_, err := NewObjectStoreClipSigner("localhost:9002", "key", "secret", "", false)
	if err == nil {
		t.Fatal("expected error for missing bucket")
	}
}
