# Image upload request-limit fix

- Prevents large event/homepage images from exceeding the hosting function request-body limit before the API route can return JSON.
- Images over the safe upload threshold or with a long edge above 2600px are resized client-side and converted to WebP before upload.
- Upload responses are parsed defensively; plain-text platform errors no longer cause `Unexpected token ... is not valid JSON`.
- Server upload routes now enforce a 4MB ceiling after client-side processing and always return JSON when the request reaches the application.
- No database migration is required.
