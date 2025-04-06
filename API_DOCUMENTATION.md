# Star Blog API Documentation

This document details the API endpoints provided by the Star Blog backend.

**Base URL:** `http://localhost:4000` (during development)

## Authentication (`/api/auth`)

Endpoints related to user registration, login, and fetching user data.

---

### 1. User Registration

* **Purpose:** Creates a new user account. Can optionally include an avatar image upload.
* **Method & Path:** `POST /api/auth/register`
* **Authentication:** Public
* **Request Body:** `multipart/form-data`
    * `email` (string, required): User's email address.
    * `password` (string, required): User's password (min 6 characters).
    * `name` (string, optional): User's display name.
    * `avatarImage` (file, optional): Image file (jpeg, png, gif, max 5MB). The key *must* be `avatarImage`.
* **Success Response:**
    * **Code:** `201 Created`
    * **Body:**
        ```json
        {
          "message": "User registered successfully!",
          "userId": 123
        }
        ```
* **Error Responses:**
    * `400 Bad Request`: Missing email/password, password too short. `{"message": "Description of error"}`
    * `409 Conflict`: Email already registered. `{"message": "This email is already registered."}`
    * `400 Bad Request` / `500 Internal Server Error`: Invalid file type, file too large, or other upload/database issues. `{"message": "Description of error"}`

---

### 2. User Login (Standard)

* **Purpose:** Authenticates a user with email and password, returns a JWT.
* **Method & Path:** `POST /api/auth/login`
* **Authentication:** Public
* **Request Body:** `application/json`
    ```json
    {
      "email": "user@example.com",
      "password": "user_password"
    }
    ```
* **Success Response:**
    * **Code:** `200 OK`
    * **Body:**
        ```json
        {
          "message": "Login successful!",
          "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
          "user": {
            "id": 5,
            "email": "user@example.com",
            "name": "User Name",
            "avatarUrl": "/uploads/avatars/image.png", // or null, or Google URL
            "createdAt": "2025-04-01T...", // Mapped if type includes
            "updatedAt": "2025-04-01T..."  // Mapped if type includes
          }
        }
        ```
* **Error Responses:**
    * `400 Bad Request`: Missing email or password. `{"message": "Email and password are required."}`
    * `401 Unauthorized`: Invalid email or password. `{"message": "Invalid credentials."}`
    * `500 Internal Server Error`: Server issue during login. `{"message": "..."}`

---

### 3. Get Current User Info

* **Purpose:** Fetches the details of the currently authenticated user based on their JWT.
* **Method & Path:** `GET /api/auth/me`
* **Authentication:** **Required** (JWT Bearer Token)
    * Header: `Authorization: Bearer <your_jwt_token>`
* **Request Body:** None
* **Success Response:**
    * **Code:** `200 OK`
    * **Body:** (User object without password hash)
        ```json
        {
          "id": 5,
          "email": "user@example.com",
          "name": "User Name",
          "avatarUrl": "/uploads/avatars/image.png",
          "createdAt": "2025-04-01T...",
          "updatedAt": "2025-04-01T..."
        }
        ```
* **Error Responses:**
    * `401 Unauthorized`: No token, invalid token, or expired token. `{"message": "Not authorized..."}`
    * `404 Not Found`: User from token not found in DB (unlikely). `{"message": "User not found..."}`
    * `500 Internal Server Error`: Server issue. `{"message": "..."}`

---

### 4. Google OAuth - Initiate

* **Purpose:** Starts the Google OAuth 2.0 authentication flow by redirecting the user to Google.
* **Method & Path:** `GET /api/auth/google`
* **Authentication:** Public
* **Request Body:** None
* **Response:** Redirects the user's browser to Google's authentication screen.

---

### 5. Google OAuth - Callback

* **Purpose:** Handles the redirect back from Google after successful authentication. Verifies user, creates/links account, generates JWT, and redirects back to the frontend.
* **Method & Path:** `GET /api/auth/google/callback`
* **Authentication:** Public (Handles Google's callback parameters)
* **Request Body:** None
* **Response:** Redirects the user's browser to the frontend application, typically with the JWT included as a query parameter:
    * Success: `http://localhost:5173/auth/callback?token=<user_jwt_token>`
    * Failure: `http://localhost:5173/login?error=google-auth-failed` (or similar)

---

## Posts (`/api/posts`)

Endpoints for creating, reading, updating, deleting, and interacting with blog posts.

---

### 1. Fetch All Posts

* **Purpose:** Retrieves a list of all blog posts, including author details, like count, and comment count. Suitable for the homepage feed.
* **Method & Path:** `GET /api/posts`
* **Authentication:** Public
* **Request Body:** None
* **Success Response:**
    * **Code:** `200 OK`
    * **Body:** `Array<Post>`
        ```json
        [
          {
            "id": 5,
            "title": "Post Title",
            "date": "2025-03-29",
            "author": {
              "id": 5,
              "name": "Author Name"
            },
            "categories": ["category1", "category2"],
            "likes": 10,
            "commentCount": 3,
            "createdAt": "2025-03-29T...",
            "updatedAt": "2025-03-31T..."
          }
        ]
        ```
* **Error Responses:**
    * `500 Internal Server Error`: Database query fails. `{"message": "..."}`

---

### 2. Fetch Single Post

* **Purpose:** Retrieves detailed information for a single blog post, including full content, author details, like count, and whether the currently authenticated user (if any) has liked the post.
* **Method & Path:** `GET /api/posts/:id`
* **Authentication:** Public, but requires a valid JWT (`Authorization: Bearer <token>`) header to get the `likedByCurrentUser` status correctly.
* **Path Parameters:**
    * `id` (number, required): The ID of the post to retrieve.
* **Request Body:** None
* **Success Response:**
    * **Code:** `200 OK`
    * **Body:** `Post` object
        ```json
        {
          "id": 5,
          "title": "Post Title",
          "content": "Full content of the post...",
          "date": "2025-03-29",
          "author": {
            "id": 5,
            "name": "Author Name"
          },
          "categories": ["category1", "category2"],
          "likes": 10,
          "likedByCurrentUser": true, // True/False based on request token (false if no token)
          "createdAt": "2025-03-29T...",
          "updatedAt": "2025-03-31T..."
        }
        ```
* **Error Responses:**
    * `400 Bad Request`: Invalid post ID format. `{"message": "Invalid post ID."}`
    * `404 Not Found`: Post with the given ID does not exist. `{"message": "Post not found."}`
    * `500 Internal Server Error`: Database query fails. `{"message": "..."}`

---

### 3. Create New Post

* **Purpose:** Creates a new blog post. The author is automatically set to the logged-in user.
* **Method & Path:** `POST /api/posts`
* **Authentication:** **Required** (JWT Bearer Token)
* **Request Headers:** `Content-Type: application/json`
* **Request Body:**
    ```json
    {
      "title": "My Awesome New Post",
      "content": "This is the full content.",
      "date": "2025-04-05",
      "categories": ["new", "blogging"]
    }
    ```
    * `title` (string, required)
    * `content` (string, optional)
    * `date` (string, optional)
    * `categories` (array of strings, optional)
* **Success Response:**
    * **Code:** `201 Created`
    * **Body:**
        ```json
        {
          "message": "Post successfully created!",
          "insertedId": 15
        }
        ```
* **Error Responses:**
    * `400 Bad Request`: Missing title. `{"message": "Title is required."}`
    * `401 Unauthorized`: Invalid/missing token.
    * `500 Internal Server Error`: Database insertion error. `{"message": "..."}`

---

### 4. Update Existing Post

* **Purpose:** Updates the details of an existing post. Only the post's author can perform this action.
* **Method & Path:** `PUT /api/posts/:id`
* **Authentication:** **Required** (JWT Bearer Token)
* **Path Parameters:**
    * `id` (number, required): The ID of the post to update.
* **Request Headers:** `Content-Type: application/json`
* **Request Body:** (Include only fields to update)
    ```json
    {
      "title": "Updated Post Title",
      "content": "Updated content here.",
      "date": "2025-04-06",
      "categories": ["updated", "react"]
    }
    ```
    * `title` (string, required)
    * `content` (string, optional)
    * `date` (string, optional)
    * `categories` (array of strings, optional)
* **Success Response:**
    * **Code:** `200 OK`
    * **Body:**
        ```json
        {
          "message": "Post successfully updated!",
          "post": { ... updated Post object (includes author, likes, etc.) ... }
        }
        ```
* **Error Responses:**
    * `400 Bad Request`: Invalid post ID format or missing title. `{"message": "..."}`
    * `401 Unauthorized`: Invalid/missing token.
    * `403 Forbidden`: User is not the author of the post. `{"message": "User not authorized to edit this post."}`
    * `404 Not Found`: Post with the given ID does not exist. `{"message": "Post not found."}`
    * `500 Internal Server Error`: Database update error. `{"message": "..."}`

---

### 5. Delete Existing Post

* **Purpose:** Deletes a specific post. Only the post's author can perform this action. Associated comments and likes will be deleted automatically via database cascade rules.
* **Method & Path:** `DELETE /api/posts/:id`
* **Authentication:** **Required** (JWT Bearer Token)
* **Path Parameters:**
    * `id` (number, required): The ID of the post to delete.
* **Request Body:** None
* **Success Response:**
    * **Code:** `200 OK`
    * **Body:**
        ```json
        {
          "message": "Post successfully deleted!"
        }
        ```
* **Error Responses:**
    * `400 Bad Request`: Invalid post ID format. `{"message": "..."}`
    * `401 Unauthorized`: Invalid/missing token.
    * `403 Forbidden`: User is not the author of the post. `{"message": "User not authorized to delete this post."}`
    * `404 Not Found`: Post with the given ID does not exist. `{"message": "Post not found."}`
    * `500 Internal Server Error`: Database deletion error. `{"message": "..."}`

---

## Likes (`/api/posts/:postId/like`)

---

### 1. Toggle Like on Post

* **Purpose:** Allows a logged-in user to like a post if they haven't already, or unlike it if they have.
* **Method & Path:** `POST /api/posts/:postId/like`
* **Authentication:** **Required** (JWT Bearer Token)
* **Path Parameters:**
    * `postId` (number, required): The ID of the post to like/unlike.
* **Request Body:** None
* **Success Response:**
    * **Code:** `200 OK`
    * **Body:**
        ```json
        {
          "message": "Post liked successfully!" or "Post unliked successfully!",
          "liked": true,
          "likes": 11
        }
        ```
* **Error Responses:**
    * `400 Bad Request`: Invalid post ID format. `{"message": "..."}`
    * `401 Unauthorized`: Invalid/missing token.
    * `404 Not Found`: Post with the given ID does not exist. `{"message": "Post not found to like/unlike."}`
    * `500 Internal Server Error`: Database error. `{"message": "..."}`

---

## Comments (`/api/posts/:postId/comments` & `/api/comments/:commentId`)

---

### 1. Fetch Comments for a Post

* **Purpose:** Retrieves all comments associated with a specific post, including basic author information. Sorted newest first.
* **Method & Path:** `GET /api/posts/:postId/comments`
* **Authentication:** Public
* **Path Parameters:**
    * `postId` (number, required): The ID of the post whose comments are to be fetched.
* **Request Body:** None
* **Success Response:**
    * **Code:** `200 OK`
    * **Body:** `Array<Comment>`
        ```json
        [
          {
            "id": 12,
            "content": "This is the newest comment!",
            "createdAt": "2025-04-01T...",
            "user": {
              "id": 2,
              "name": "Commenter Name",
              "avatarUrl": "/uploads/avatars/..."
            }
          }
        ]
        ```
* **Error Responses:**
    * `400 Bad Request`: Invalid post ID format. `{"message": "..."}`
    * `500 Internal Server Error`: Database error. `{"message": "..."}`

---

### 2. Add Comment to Post

* **Purpose:** Creates a new comment associated with a specific post for the logged-in user. Emits a real-time notification to the post author if they are different from the commenter.
* **Method & Path:** `POST /api/posts/:postId/comments`
* **Authentication:** **Required** (JWT Bearer Token)
* **Path Parameters:**
    * `postId` (number, required): The ID of the post to comment on.
* **Request Headers:** `Content-Type: application/json`
* **Request Body:**
    ```json
    {
      "content": "This is my insightful comment."
    }
    ```
    * `content` (string, required): The text of the comment.
* **Success Response:**
    * **Code:** `201 Created`
    * **Body:** `Comment` object (the newly created comment with user details)
        ```json
        {
          "id": 13,
          "content": "This is my insightful comment.",
          "createdAt": "2025-04-01T...",
          "user": { /* ... commenter info ... */ }
        }
        ```
* **Error Responses:**
    * `400 Bad Request`: Invalid post ID format or empty comment content. `{"message": "..."}`
    * `401 Unauthorized`: Invalid/missing token.
    * `404 Not Found`: Post with the given ID does not exist. `{"message": "Cannot add comment: Post not found."}`
    * `500 Internal Server Error`: Database error. `{"message": "..."}`

---

### 3. Edit a Comment

* **Purpose:** Updates the content of an existing comment. Only the comment's original author can perform this action.
* **Method & Path:** `PUT /api/comments/:commentId`
* **Authentication:** **Required** (JWT Bearer Token)
* **Path Parameters:**
    * `commentId` (number, required): The ID of the comment to update.
* **Request Headers:** `Content-Type: application/json`
* **Request Body:**
    ```json
    {
      "content": "This is the updated comment text."
    }
    ```
    * `content` (string, required): The new text for the comment.
* **Success Response:**
    * **Code:** `200 OK`
    * **Body:**
        ```json
        {
          "message": "Comment updated successfully",
          "comment": { ... updated Comment object with user info and updatedAt ... }
        }
        ```
* **Error Responses:**
    * `400 Bad Request`: Invalid comment ID format or empty content. `{"message": "..."}`
    * `401 Unauthorized`: Invalid/missing token.
    * `403 Forbidden`: User is not the author of the comment. `{"message": "User not authorized to edit this comment."}`
    * `404 Not Found`: Comment with the given ID does not exist. `{"message": "Comment not found."}`
    * `500 Internal Server Error`: Database error. `{"message": "..."}`

---

### 4. Delete a Comment

* **Purpose:** Deletes a specific comment. Only the comment's original author can perform this action.
* **Method & Path:** `DELETE /api/comments/:commentId`
* **Authentication:** **Required** (JWT Bearer Token)
* **Path Parameters:**
    * `commentId` (number, required): The ID of the comment to delete.
* **Request Body:** None
* **Success Response:**
    * **Code:** `200 OK`
    * **Body:**
        ```json
        {
          "message": "Comment deleted successfully!"
        }
        ```
* **Error Responses:**
    * `400 Bad Request`: Invalid comment ID format. `{"message": "..."}`
    * `401 Unauthorized`: Invalid/missing token.
    * `403 Forbidden`: User is not the author of the comment. `{"message": "User not authorized to delete this comment."}`
    * `404 Not Found`: Comment with the given ID does not exist. `{"message": "Comment not found."}`
    * `500 Internal Server Error`: Database error. `{"message": "..."}`

---

## User Profile (`/api/users`)

Endpoints for managing the logged-in user's own profile. All require authentication.

---

### 1. Update User Profile (Name/Avatar)

* **Purpose:** Allows the logged-in user to update their display name and/or upload a new avatar image.
* **Method & Path:** `PUT /api/users/profile`
* **Authentication:** **Required** (JWT Bearer Token)
* **Request Body:** `multipart/form-data`
    * `name` (string, optional): The new display name for the user.
    * `avatarImage` (file, optional): The new avatar image file (jpeg, png, gif, max 5MB). Key must be `avatarImage`.
* **Success Response:**
    * **Code:** `200 OK`
    * **Body:**
        ```json
        {
          "message": "Profile updated successfully!",
          "user": { ... updated User object (excluding password hash) ... }
        }
        ```
* **Error Responses:**
    * `400 Bad Request`: No update data provided, or invalid file type/size. `{"message": "..."}`
    * `401 Unauthorized`: Invalid/missing token.
    * `404 Not Found`: User not found (unlikely). `{"message": "..."}`
    * `500 Internal Server Error`: File upload or database error. `{"message": "..."}`

---

### 2. Change Password

* **Purpose:** Allows the logged-in user to change their password by providing their current password.
* **Method & Path:** `PUT /api/users/password`
* **Authentication:** **Required** (JWT Bearer Token)
* **Request Headers:** `Content-Type: application/json`
* **Request Body:**
    ```json
    {
      "currentPassword": "user_current_password",
      "newPassword": "user_new_secure_password"
    }
    ```
    * `currentPassword` (string, required)
    * `newPassword` (string, required, min 6 characters, different from current)
* **Success Response:**
    * **Code:** `200 OK`
    * **Body:**
        ```json
        {
          "message": "Password updated successfully!"
        }
        ```
* **Error Responses:**
    * `400 Bad Request`: Missing fields, new password too short, new password same as old. `{"message": "..."}`
    * `401 Unauthorized`: Invalid/missing token OR incorrect `currentPassword`. `{"message": "Incorrect current password."}`
    * `404 Not Found`: User not found (unlikely). `{"message": "..."}`
    * `500 Internal Server Error`: Hashing or database error. `{"message": "..."}`

