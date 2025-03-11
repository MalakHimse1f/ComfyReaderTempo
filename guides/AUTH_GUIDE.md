# Authentication Implementation Guide

This document provides guidance on how to use the authentication system in the ComfyReaderTempo project. It serves as a reference for developers working on new components and features that need to interact with the authentication system.

## Overview

ComfyReaderTempo uses Supabase Authentication with a React Context-based implementation. This provides a secure, scalable authentication solution that's easy to integrate with new components.

## Core Components

### 1. Auth Provider

The `AuthProvider` (located in `/supabase/auth.tsx`) is the central component of our authentication system. It:

- Manages authentication state (user, loading)
- Provides authentication methods (signIn, signUp, signOut)
- Listens for changes in authentication state
- Makes authentication information available throughout the app

### 2. Auth Hook

The `useAuth` hook provides components with access to authentication state and methods:

```typescript
const { user, loading, signIn, signUp, signOut } = useAuth();
```

### 3. Supabase Client

The Supabase client (`/supabase/supabase.ts`) initializes the connection to Supabase using environment variables.

## How to Use Authentication in New Components

### Accessing Authentication State

To access authentication state in a component:

```typescript
import { useAuth } from "../../../supabase/auth";

function MyComponent() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!user) {
    return <div>Please sign in</div>;
  }

  return (
    <div>
      <h1>Welcome, {user.email}</h1>
      {/* Component content */}
    </div>
  );
}
```

### Implementing Sign In/Sign Up

For components handling sign-in or sign-up:

```typescript
import { useState } from "react";
import { useAuth } from "../../../supabase/auth";
import { useNavigate } from "react-router-dom";

function AuthComponent() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const { signIn } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await signIn(email, password);
      navigate("/dashboard");
    } catch (error) {
      setError("Authentication failed");
    }
  };

  // Render form...
}
```

### Implementing Sign Out

For components with sign-out functionality:

```typescript
import { useAuth } from "../../../supabase/auth";
import { useNavigate } from "react-router-dom";

function LogoutButton() {
  const { signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return <button onClick={handleSignOut}>Sign Out</button>;
}
```

### Creating Protected Routes

To protect routes that require authentication:

```typescript
import { Navigate } from "react-router-dom";
import { useAuth } from "../../../supabase/auth";

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/login" />;
  }

  return children;
}

// Usage in routes:
<Route
  path="/protected-page"
  element={
    <ProtectedRoute>
      <ProtectedPage />
    </ProtectedRoute>
  }
/>;
```

## User Data

### Available User Properties

The `user` object from Supabase contains:

- `id`: Unique user identifier
- `email`: User's email address
- `user_metadata`: Custom user data (including `full_name` if provided during sign-up)

Example of accessing user metadata:

```typescript
const { user } = useAuth();
const fullName = user?.user_metadata?.full_name || "User";
```

### Storing User-Specific Data

When storing user-specific data in Supabase tables:

1. Always include a `user_id` column that references the `id` from the `auth.users` table
2. Use Row Level Security (RLS) policies in Supabase to restrict access to user-specific data

## Best Practices

### 1. Authentication State Management

- **Always check loading state** before rendering content based on authentication status
- **Handle authentication errors** gracefully with clear user feedback
- **Redirect users** to appropriate routes after authentication changes

### 2. Protected Content

- Use the `PrivateRoute` component for routes that require authentication
- In components, conditionally render sensitive content based on authentication status
- Avoid assuming authentication state is consistent across component renders

### 3. User Sessions

- User sessions are managed automatically by Supabase
- Auth state persists across page refreshes
- Always provide a way for users to sign out

### 4. Form Validation

- Implement client-side validation for authentication forms
- Provide clear error messages for authentication failures
- Consider using formik or react-hook-form for complex form validation

## Authentication Flow Diagram

```
┌─────────────┐     ┌──────────────┐     ┌────────────────┐
│ Login/      │     │  AuthContext │     │                │
│ Signup Form │────▶│  (Provider)  │────▶│  Supabase Auth │
└─────────────┘     └──────────────┘     └────────────────┘
                           │
                           │
                           ▼
              ┌─────────────────────────┐
              │                         │
              │  User authenticated?    │
              │                         │
              └─────────────────────────┘
                     /           \
                    /             \
                   ▼               ▼
┌─────────────────────────┐ ┌────────────────────┐
│                         │ │                    │
│  Protected Components   │ │  Public Components │
│  (Dashboard, Reader)    │ │  (Landing Page)    │
│                         │ │                    │
└─────────────────────────┘ └────────────────────┘
```

## Extending Authentication

### Adding Social Logins

To add social authentication providers (Google, GitHub, etc.):

1. Configure the provider in the Supabase dashboard
2. Add the provider-specific login method to the `AuthProvider`
3. Create UI components for the new login options

### Adding Profile Management

For user profile management:

1. Create a profile table in Supabase linked to user IDs
2. Add profile update methods to the Auth context (or create a separate profile context)
3. Create profile management UI components

## Troubleshooting

Common authentication issues:

1. **User Not Persisting**: Check that env variables for Supabase are correctly set
2. **Authentication Errors**: Check browser console for specific error messages
3. **Protected Routes Not Working**: Ensure PrivateRoute component is being used correctly
4. **CORS Issues**: Verify Supabase project settings for allowed origins

---

This guide should be updated as the authentication system evolves. For implementation details, refer to the source code in `/supabase/auth.tsx`.
