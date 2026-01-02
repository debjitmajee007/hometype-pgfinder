# PG Finder Backend Server

Simple Node.js + Express backend for PG Finder authentication.

## Installation

1. **Install Node.js** (if not already installed)
   - Download from: https://nodejs.org/
   - Verify installation: `node --version`

2. **Install dependencies**
   ```bash
   npm install
   ```

## Running the Server

### Start the server:
```bash
npm start
```

Or using Node directly:
```bash
node server.js
```

### For development (auto-restart on changes):
```bash
npm run dev
```

## Server Information

- **Port**: 3000
- **Base URL**: http://localhost:3000
- **CORS**: Enabled for all origins
- **JSON Parsing**: Enabled

## API Endpoints

### POST /api/auth/signup
Register a new user.

**Request Body:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "password123",
  "role": "student"
}
```

**Success Response (201):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "role": "student",
  "user": {
    "id": 1,
    "name": "John Doe",
    "email": "john@example.com"
  }
}
```

**Error Response (400/409):**
```json
{
  "message": "Validation failed",
  "errors": {
    "email": "Email already registered"
  }
}
```

### POST /api/auth/login
Login with email and password.

**Request Body:**
```json
{
  "email": "john@example.com",
  "password": "password123"
}
```

**Success Response (200):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "role": "student",
  "user": {
    "id": 1,
    "name": "John Doe",
    "email": "john@example.com"
  }
}
```

**Error Response (401):**
```json
{
  "message": "Invalid credentials",
  "errors": {
    "email": "Email or password is incorrect"
  }
}
```

### GET /api/health
Health check endpoint.

**Response (200):**
```json
{
  "status": "OK",
  "message": "PG Finder API is running",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## User Roles

Accepted roles:
- `student`
- `owner`
- `admin`

## Notes

- **In-memory storage**: Users are stored in memory and will be lost when the server restarts
- **No password hashing**: Passwords are stored in plain text (for development only!)
- **JWT Secret**: Change `JWT_SECRET` in production
- **Token Expiry**: Tokens expire in 7 days

## Troubleshooting

### Port already in use
If port 3000 is already in use, either:
1. Stop the other service using port 3000
2. Change the PORT in `server.js`

### CORS errors
CORS is enabled for all origins. If you still see CORS errors, check:
- Backend server is running
- Frontend is making requests to the correct URL
- Browser console for specific error messages

### Module not found
Make sure you've run `npm install` to install all dependencies.

