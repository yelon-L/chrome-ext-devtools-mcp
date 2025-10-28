# Email + Password Authentication Tutorial

**Feature**: Add user registration and login with email + password  
**Date**: 2025-10-14  
**Difficulty**: Medium

---

## 🎯 Goal

Add complete email + password authentication system:

- User registration with email and password
- Secure password hashing (bcrypt)
- User login with JWT token generation
- Password validation

---

## 📋 Prerequisites

- PostgreSQL database running
- Node.js installed
- Project built successfully

---

## 🚀 Step-by-Step Tutorial

### Step 1: Install Dependencies

Install bcrypt for password hashing and jsonwebtoken for authentication:

```bash
npm install bcrypt @types/bcrypt jsonwebtoken @types/jsonwebtoken
```

**Expected Output**:

```
added 2 packages, and audited 500 packages in 5s
```

---

### Step 2: Create Database Migration

Create a new migration file to add `password_hash` field:

**File**: `src/multi-tenant/storage/migrations/002-add-password-auth.sql`

```bash
cat > src/multi-tenant/storage/migrations/002-add-password-auth.sql << 'EOF'
-- Migration: 002 - Add Password Authentication
-- Date: 2025-10-14
-- Description: Add password_hash field for email+password authentication

-- ============================================================================
-- UP Migration: Add password_hash column
-- ============================================================================

-- Add password_hash to mcp_users table
ALTER TABLE mcp_users
ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);

-- Add index for faster authentication queries
CREATE INDEX IF NOT EXISTS idx_email_password ON mcp_users(email, password_hash);

-- Comments
COMMENT ON COLUMN mcp_users.password_hash IS 'Bcrypt hashed password for authentication';

-- ============================================================================
-- DOWN Migration: Remove password_hash column
-- ============================================================================
-- Uncomment to enable rollback

-- DROP INDEX IF EXISTS idx_email_password;
-- ALTER TABLE mcp_users DROP COLUMN IF EXISTS password_hash;
EOF
```

**Expected Output**: File created successfully

---

### Step 3: Run Migration

Apply the migration to your database:

```bash
# Connect to your PostgreSQL database
export PGHOST="192.168.0.205"
export PGPORT="5432"
export PGUSER="admin"
export PGPASSWORD="admin"
export PGDATABASE="your_database_name"

# Run migration
psql -h $PGHOST -p $PGPORT -U $PGUSER -d $PGDATABASE \
  -f src/multi-tenant/storage/migrations/002-add-password-auth.sql
```

**Expected Output**:

```
ALTER TABLE
CREATE INDEX
COMMENT
```

**Verify**:

```bash
psql -h $PGHOST -p $PGPORT -U $PGUSER -d $PGDATABASE \
  -c "\d mcp_users"
```

You should see `password_hash` column in the table.

---

### Step 4: Create Authentication Helper

Create a helper module for password hashing and JWT:

**File**: `src/multi-tenant/core/AuthHelper.ts`

```bash
cat > src/multi-tenant/core/AuthHelper.ts << 'EOF'
/**
 * Authentication Helper
 * Handles password hashing and JWT token generation
 */

import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const SALT_ROUNDS = 10;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = '24h'; // Token valid for 24 hours

export interface JWTPayload {
  userId: string;
  email: string;
  iat?: number;
  exp?: number;
}

/**
 * Hash a password using bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Verify a password against a hash
 */
export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Generate a JWT token
 */
export function generateToken(payload: Omit<JWTPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });
}

/**
 * Verify and decode a JWT token
 */
export function verifyToken(token: string): JWTPayload {
  return jwt.verify(token, JWT_SECRET) as JWTPayload;
}

/**
 * Validate password strength
 * Rules: At least 8 characters, 1 uppercase, 1 lowercase, 1 number
 */
export function validatePasswordStrength(password: string): {
  valid: boolean;
  message: string;
} {
  if (password.length < 8) {
    return {
      valid: false,
      message: 'Password must be at least 8 characters long',
    };
  }

  if (!/[A-Z]/.test(password)) {
    return {
      valid: false,
      message: 'Password must contain at least one uppercase letter',
    };
  }

  if (!/[a-z]/.test(password)) {
    return {
      valid: false,
      message: 'Password must contain at least one lowercase letter',
    };
  }

  if (!/[0-9]/.test(password)) {
    return {
      valid: false,
      message: 'Password must contain at least one number',
    };
  }

  return {
    valid: true,
    message: 'Password is strong',
  };
}

/**
 * Validate email format
 */
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}
EOF
```

**Expected Output**: File created successfully

---

### Step 5: Update Storage Adapter

Add password-based registration and login methods to PostgreSQL adapter:

**File**: `src/multi-tenant/storage/PostgreSQLStorageAdapter.ts`

Add these methods to the class (after the existing `registerUser` method):

```typescript
/**
 * Register user with email and password
 */
async registerUserWithPassword(
  email: string,
  password: string,
  username?: string
): Promise<UserRecordV2> {
  // Import at top of file
  const { hashPassword, validateEmail, validatePasswordStrength } = await import('../core/AuthHelper.js');

  // Validate email
  if (!validateEmail(email)) {
    throw new Error('Invalid email format');
  }

  // Validate password strength
  const passwordValidation = validatePasswordStrength(password);
  if (!passwordValidation.valid) {
    throw new Error(passwordValidation.message);
  }

  // Hash password
  const passwordHash = await hashPassword(password);

  // Generate user ID
  const userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // Insert user with password
  await this.db
    .insertInto('mcp_users')
    .values({
      user_id: userId,
      email: email,
      username: username || email.split('@')[0],
      registered_at: Date.now(),
      password_hash: passwordHash,
      metadata: null,
    })
    .execute();

  return {
    userId,
    email,
    username: username || email.split('@')[0],
    registeredAt: Date.now(),
  };
}

/**
 * Login user with email and password
 */
async loginWithPassword(
  email: string,
  password: string
): Promise<{ user: UserRecordV2; token: string }> {
  // Import at top of file
  const { verifyPassword, generateToken } = await import('../core/AuthHelper.js');

  // Get user from database
  const result = await this.db
    .selectFrom('mcp_users')
    .select(['user_id', 'email', 'username', 'registered_at', 'password_hash'])
    .where('email', '=', email)
    .executeTakeFirst();

  if (!result) {
    throw new Error('Invalid email or password');
  }

  if (!result.password_hash) {
    throw new Error('This account does not have a password set. Please use email-only login or reset your password.');
  }

  // Verify password
  const isValid = await verifyPassword(password, result.password_hash);
  if (!isValid) {
    throw new Error('Invalid email or password');
  }

  // Generate JWT token
  const token = generateToken({
    userId: result.user_id,
    email: result.email,
  });

  return {
    user: {
      userId: result.user_id,
      email: result.email,
      username: result.username,
      registeredAt: Number(result.registered_at),
    },
    token,
  };
}
```

---

### Step 6: Create API Endpoints

Add registration and login endpoints:

**File**: `src/multi-tenant/handlers-v2.ts`

Add these new handler methods:

```typescript
/**
 * POST /api/v2/auth/register
 * Register with email and password
 */
async handleRegisterWithPassword(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const { email, password, username } = await this.parseBody<{
    email: string;
    password: string;
    username?: string;
  }>(req);

  if (!email || !password) {
    res.writeHead(400, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({
      error: 'Email and password are required',
    }));
    return;
  }

  try {
    const storage = this.getUnifiedStorage() as any; // Type assertion for new method
    const user = await storage.registerUserWithPassword(email, password, username);

    res.writeHead(201, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({
      success: true,
      user: {
        userId: user.userId,
        email: user.email,
        username: user.username,
      },
    }));
  } catch (error) {
    res.writeHead(400, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({
      error: error instanceof Error ? error.message : 'Registration failed',
    }));
  }
}

/**
 * POST /api/v2/auth/login
 * Login with email and password
 */
async handleLogin(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const { email, password } = await this.parseBody<{
    email: string;
    password: string;
  }>(req);

  if (!email || !password) {
    res.writeHead(400, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({
      error: 'Email and password are required',
    }));
    return;
  }

  try {
    const storage = this.getUnifiedStorage() as any; // Type assertion for new method
    const result = await storage.loginWithPassword(email, password);

    res.writeHead(200, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({
      success: true,
      user: result.user,
      token: result.token,
    }));
  } catch (error) {
    res.writeHead(401, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({
      error: error instanceof Error ? error.message : 'Login failed',
    }));
  }
}
```

Update the routing in `handleRequest` method:

```typescript
// Add these routes in the routing section
if (url.pathname === '/api/v2/auth/register' && req.method === 'POST') {
  return this.handleRegisterWithPassword(req, res);
}

if (url.pathname === '/api/v2/auth/login' && req.method === 'POST') {
  return this.handleLogin(req, res);
}
```

---

### Step 7: Compile TypeScript

Build the project:

```bash
npm run build
```

**Expected Output**:

```
✅ version: 0.8.10
✅ Copied public file: index.html
```

---

### Step 8: Test the Implementation

Create a test script:

**File**: `test-auth.sh`

```bash
cat > test-auth.sh << 'EOF'
#!/bin/bash

API_URL="http://localhost:3000"

echo "================================"
echo "Testing Authentication System"
echo "================================"
echo ""

# Test 1: Register new user
echo "[Test 1] Register new user"
REGISTER_RESPONSE=$(curl -s -X POST "$API_URL/api/v2/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test1234",
    "username": "Test User"
  }')

echo "Response: $REGISTER_RESPONSE"
echo ""

# Test 2: Login with correct credentials
echo "[Test 2] Login with correct credentials"
LOGIN_RESPONSE=$(curl -s -X POST "$API_URL/api/v2/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test1234"
  }')

echo "Response: $LOGIN_RESPONSE"

# Extract token
TOKEN=$(echo $LOGIN_RESPONSE | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
echo "Token: $TOKEN"
echo ""

# Test 3: Login with wrong password
echo "[Test 3] Login with wrong password (should fail)"
WRONG_LOGIN=$(curl -s -X POST "$API_URL/api/v2/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "WrongPassword"
  }')

echo "Response: $WRONG_LOGIN"
echo ""

# Test 4: Register with weak password
echo "[Test 4] Register with weak password (should fail)"
WEAK_PASSWORD=$(curl -s -X POST "$API_URL/api/v2/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "weak@example.com",
    "password": "weak"
  }')

echo "Response: $WEAK_PASSWORD"
echo ""

echo "================================"
echo "Tests completed"
echo "================================"
EOF

chmod +x test-auth.sh
```

---

### Step 9: Run Tests

Start the server and run tests:

```bash
# Terminal 1: Start server
node build/src/multi-tenant/server-multi-tenant.js

# Terminal 2: Run tests
./test-auth.sh
```

**Expected Output**:

```
================================
Testing Authentication System
================================

[Test 1] Register new user
Response: {"success":true,"user":{"userId":"user_...","email":"test@example.com","username":"Test User"}}

[Test 2] Login with correct credentials
Response: {"success":true,"user":{...},"token":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."}
Token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

[Test 3] Login with wrong password (should fail)
Response: {"error":"Invalid email or password"}

[Test 4] Register with weak password (should fail)
Response: {"error":"Password must be at least 8 characters long"}

================================
Tests completed
================================
```

---

## ✅ Verification Checklist

- [ ] Dependencies installed (bcrypt, jsonwebtoken)
- [ ] Migration 002 created and run
- [ ] `password_hash` column exists in `mcp_users` table
- [ ] `AuthHelper.ts` file created
- [ ] Storage adapter methods added
- [ ] API endpoints added to handlers
- [ ] Project compiles successfully
- [ ] Registration works with valid password
- [ ] Login works with correct credentials
- [ ] Login fails with wrong password
- [ ] Weak passwords are rejected

---

## 🔒 Security Notes

### Production Deployment

1. **Change JWT Secret**:

   ```bash
   export JWT_SECRET="your-super-secret-key-minimum-32-characters"
   ```

2. **Use HTTPS**: Never send passwords over HTTP

3. **Rate Limiting**: Add rate limiting to prevent brute force:

   ```typescript
   // Example with express-rate-limit
   const loginLimiter = rateLimit({
     windowMs: 15 * 60 * 1000, // 15 minutes
     max: 5, // 5 attempts
   });
   ```

4. **Password Requirements**: Current rules:
   - Minimum 8 characters
   - At least 1 uppercase letter
   - At least 1 lowercase letter
   - At least 1 number

5. **Token Storage**: Store JWT in httpOnly cookies (not localStorage)

---

## 📚 API Reference

### POST /api/v2/auth/register

Register a new user with email and password.

**Request**:

```json
{
  "email": "user@example.com",
  "password": "SecurePass123",
  "username": "John Doe" // optional
}
```

**Response (201)**:

```json
{
  "success": true,
  "user": {
    "userId": "user_1234567890_abc123",
    "email": "user@example.com",
    "username": "John Doe"
  }
}
```

**Error (400)**:

```json
{
  "error": "Password must contain at least one uppercase letter"
}
```

### POST /api/v2/auth/login

Login with email and password to receive JWT token.

**Request**:

```json
{
  "email": "user@example.com",
  "password": "SecurePass123"
}
```

**Response (200)**:

```json
{
  "success": true,
  "user": {
    "userId": "user_1234567890_abc123",
    "email": "user@example.com",
    "username": "John Doe"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Error (401)**:

```json
{
  "error": "Invalid email or password"
}
```

---

## 🎉 Next Steps

1. **Add Password Reset**: Implement "forgot password" functionality
2. **Email Verification**: Send verification emails on registration
3. **2FA**: Add two-factor authentication
4. **Session Management**: Implement refresh tokens
5. **OAuth**: Add Google/GitHub login

---

## ❓ Troubleshooting

### Error: "bcrypt not found"

```bash
npm install bcrypt @types/bcrypt --save
```

### Error: "Column password_hash does not exist"

```bash
# Run migration again
psql -h $PGHOST -p $PGPORT -U $PGUSER -d $PGDATABASE \
  -f src/multi-tenant/storage/migrations/002-add-password-auth.sql
```

### Error: "JWT secret not set"

```bash
export JWT_SECRET="your-secret-key"
```

---

**Tutorial Complete!** 🎉

You now have a fully functional email + password authentication system with:

- ✅ Secure password hashing (bcrypt)
- ✅ JWT token generation
- ✅ Password strength validation
- ✅ Email format validation
- ✅ Registration API
- ✅ Login API
