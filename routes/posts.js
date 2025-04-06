const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const { protect, tryAttachUser } = require('../middleware/authMiddleware');

router.get('/', async (req, res) => {
  try {
    const sql = `
      SELECT
        p.id, p.title, p.content, p.date, p.categories,
        p.created_at, p.updated_at,
        u.id AS authorId, u.name AS authorName,
        COUNT(DISTINCT pl.user_id) AS likes,
        COUNT(DISTINCT c.id) AS commentCount
      FROM posts p
      LEFT JOIN users u ON p.author_id = u.id
      LEFT JOIN post_likes pl ON p.id = pl.post_id
      LEFT JOIN comments c ON p.id = c.post_id
      GROUP BY p.id
      ORDER BY p.created_at DESC
    `;
    const [results] = await pool.query(sql);

    const posts = results.map(post => ({
      id: post.id,
      title: post.title,
      content: post.content,
      date: post.date,
      author: { id: post.authorId, name: post.authorName || 'Unknown Author' },
      categories: typeof post.categories === 'string' ? JSON.parse(post.categories) : post.categories ?? [],
      likes: Number(post.likes),
      commentCount: Number(post.commentCount),
      createdAt: post.created_at,
      updatedAt: post.updated_at
    }));

    res.json(posts);
  } catch (error) {
    console.error('Error fetching posts:', error);
    res.status(500).json({ message: "Internal server error while fetching posts.", error: error.message });
  }
});

router.get('/:id', tryAttachUser, async (req, res) => {
  const postId = parseInt(req.params.id);
  const userId = req.user?.id;

  if (isNaN(postId)) return res.status(400).json({ message: "Invalid post ID." });

  try {
    const postSql = `
      SELECT p.*, u.id AS authorId, u.name AS authorName
      FROM posts p
      LEFT JOIN users u ON p.author_id = u.id
      WHERE p.id = ?
    `;
    const [postResult] = await pool.query(postSql, [postId]);

    if (!postResult.length) return res.status(404).json({ message: "Post not found." });

    const postData = postResult[0];

    const [[{ totalLikes }]] = await pool.query(
      "SELECT COUNT(*) as totalLikes FROM post_likes WHERE post_id = ?",
      [postId]
    );

    let likedByCurrentUser = false;

    if (userId) {
      const [[{ count }]] = await pool.query(
        "SELECT COUNT(*) as count FROM post_likes WHERE post_id = ? AND user_id = ?",
        [postId, userId]
      );
      likedByCurrentUser = count > 0;
    }

    const post = {
      id: postData.id,
      title: postData.title,
      content: postData.content,
      date: postData.date,
      author: { id: postData.authorId, name: postData.authorName || 'Unknown Author' },
      categories: typeof postData.categories === 'string' ? JSON.parse(postData.categories) : postData.categories ?? [],
      likes: Number(totalLikes),
      likedByCurrentUser,
      createdAt: postData.created_at,
      updatedAt: postData.updated_at
    };

    res.json(post);
  } catch (error) {
    console.error(`Error fetching post with ID ${postId}:`, error);
    res.status(500).json({ message: "Internal server error while fetching the post.", error: error.message });
  }
});

router.post('/', protect, async (req, res) => {
  const authorId = req.user.id;
  const { title, content, date, categories } = req.body;

  if (!title) return res.status(400).json({ message: "Title is required." });

  try {
    const sql = `
      INSERT INTO posts (title, content, author_id, date, categories)
      VALUES (?, ?, ?, ?, ?)
    `;
    const values = [title, content || null, authorId, date || null, JSON.stringify(categories || [])];
    const [results] = await pool.query(sql, values);

    res.status(201).json({ message: "Post successfully created!", insertedId: results.insertId });
  } catch (error) {
    console.error("Error creating post:", error);
    res.status(500).json({ message: "Internal server error while creating the post.", error: error.message });
  }
});

router.put('/:id', protect, async (req, res) => {
  const postId = parseInt(req.params.id);
  const userId = req.user.id;
  const { title, content, date, categories } = req.body;

  if (isNaN(postId)) return res.status(400).json({ message: "Invalid post ID." });
  if (!title) return res.status(400).json({ message: "Title is required for updates." });

  let connection;

  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [posts] = await connection.query("SELECT author_id FROM posts WHERE id = ?", [postId]);
    if (!posts.length) {
      await connection.rollback();
      return res.status(404).json({ message: "Post not found." });
    }

    if (posts[0].author_id !== userId) {
      await connection.rollback();
      return res.status(403).json({ message: "User not authorized to edit this post." });
    }

    const updateSql = `
      UPDATE posts
      SET title = ?, content = ?, date = ?, categories = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;
    const values = [title, content || null, date || null, JSON.stringify(categories || []), postId];
    const [results] = await connection.query(updateSql, values);

    if (results.affectedRows === 0) {
      await connection.rollback();
      return res.status(404).json({ message: "Post not found during update attempt." });
    }

    const [updatedPostResult] = await connection.query(
      "SELECT p.*, u.id AS authorId, u.name AS authorName FROM posts p LEFT JOIN users u ON p.author_id = u.id WHERE p.id = ?",
      [postId]
    );

    await connection.commit();

    const post = updatedPostResult[0];
    const mappedPost = {
      id: post.id,
      title: post.title,
      content: post.content,
      date: post.date,
      author: { id: post.authorId, name: post.authorName || 'Unknown Author' },
      categories: typeof post.categories === 'string' ? JSON.parse(post.categories) : post.categories ?? [],
      likes: Number(post.likes || 0),
      createdAt: post.created_at,
      updatedAt: post.updated_at
    };

    res.status(200).json({ message: "Post successfully updated!", post: mappedPost });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error(`Error updating post with ID ${postId}:`, error);
    res.status(500).json({ message: "Internal server error while updating the post.", error: error.message });
  } finally {
    if (connection) connection.release();
  }
});

router.delete("/:id", protect, async (req, res) => {
  const postId = req.params.id;
  const userId = req.user.id;

  if (isNaN(parseInt(postId))) { return res.status(400).json({ message: "Invalid post ID." }); }

  let connection;
  try {
      connection = await pool.getConnection();
      await connection.beginTransaction();

      const [posts] = await connection.query("SELECT author_id FROM posts WHERE id = ?", [postId]);
      if (posts.length === 0) {
          await connection.rollback();
          return res.status(404).json({ message: "Post not found." });
      }
      if (posts[0].author_id !== userId) {
          await connection.rollback();
          return res.status(403).json({ message: "User not authorized to delete this post." });
      }

      const sql = "DELETE FROM posts WHERE id = ?";
      const [results] = await connection.query(sql, [postId]);

      if (results.affectedRows === 0) {
           await connection.rollback();
           return res.status(404).json({ message: "Post not found during delete attempt." });
      }

      await connection.commit();

      res.status(200).json({ message: "Post successfully deleted!" });
  } catch (error) {
      if (connection) await connection.rollback();
      console.error(`Error deleting post with ID ${postId}:`, error);
      res.status(500).json({ message: "Internal server error while deleting the post.", error: error.message });
  } finally {
      if (connection) connection.release();
  }
});

router.get('/:postId/comments', async (req, res) => {
  const postId = parseInt(req.params.postId);
  if (isNaN(postId)) return res.status(400).json({ message: "Invalid post ID." });

  try {
    const sql = `
      SELECT c.id, c.content, c.created_at, c.user_id AS userId,
             u.name AS userName, u.avatar_url AS userAvatarUrl
      FROM comments c
      JOIN users u ON c.user_id = u.id
      WHERE c.post_id = ?
      ORDER BY c.created_at DESC
    `;
    const [comments] = await pool.query(sql, [postId]);

    const mappedComments = comments.map(comment => ({
      id: comment.id,
      content: comment.content,
      createdAt: comment.created_at,
      user: {
        id: comment.userId,
        name: comment.userName,
        avatarUrl: comment.userAvatarUrl
      }
    }));

    res.json(mappedComments);
  } catch (error) {
    console.error(`Error fetching comments for post ${postId}:`, error);
    res.status(500).json({ message: "Internal server error while fetching comments.", error: error.message });
  }
});

router.post("/:postId/comments", protect, async (req, res) => {
  const postId = parseInt(req.params.postId);
  const userId = req.user.id;
  const { content } = req.body;

  if (isNaN(postId)) return res.status(400).json({ message: "Invalid post ID." });
  if (!content || typeof content !== "string" || content.trim().length === 0) {
    return res.status(400).json({ message: "Comment content cannot be empty." });
  }

  try {
    const [insertResult] = await pool.query(
      "INSERT INTO comments (post_id, user_id, content) VALUES (?, ?, ?)",
      [postId, userId, content.trim()]
    );

    const newCommentId = insertResult.insertId;

    const selectSql = `
      SELECT c.id, c.content, c.created_at,
             u.id as userId, u.name as userName, u.avatar_url as userAvatarUrl,
             p.title as postTitle, p.author_id as postAuthorId
      FROM comments c
      JOIN users u ON c.user_id = u.id
      JOIN posts p ON c.post_id = p.id
      WHERE c.id = ?
    `;
    const [commentData] = await pool.query(selectSql, [newCommentId]);

    if (!commentData.length) throw new Error("Failed to retrieve newly created comment.");

    const data = commentData[0];

    const newComment = {
      id: data.id,
      content: data.content,
      createdAt: data.created_at,
      user: {
        id: data.userId,
        name: data.userName,
        avatarUrl: data.userAvatarUrl
      }
    };

    if (data.postAuthorId && data.postAuthorId !== userId) {
      const io = req.app.get('socketio');
      if (io) {
        io.to(data.postAuthorId.toString()).emit('new_notification', {
          message: `${data.userName} commented on your post "${data.postTitle || 'Post'}"`,
          postId,
          commentId: data.id,
          timestamp: new Date().toISOString()
        });
      }
    }

    res.status(201).json(newComment);
  } catch (error) {
    console.error(`Error posting comment on post ${postId}:`, error);
    res.status(500).json({ message: "Internal server error while posting comment.", error: error.message });
  }
});

module.exports = router;
