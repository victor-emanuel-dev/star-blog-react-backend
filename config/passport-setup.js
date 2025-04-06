const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const jwt = require('jsonwebtoken');
const pool = require('./db');
require('dotenv').config();

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: '/api/auth/google/callback',
      scope: ['profile', 'email']
    },
    async (accessToken, refreshToken, profile, done) => {
      const googleId = profile.id;
      const email = profile.emails?.[0]?.value || null;
      const name = profile.displayName || `${profile.name?.givenName || ''} ${profile.name?.familyName || ''}`.trim();
      const avatarUrl = profile.photos?.[0]?.value || null;

      if (!email) return done(new Error('Email not found in Google profile'), null);

      try {
        let user;

        const [usersByGoogleId] = await pool.query(
          'SELECT id, email, name, google_id, avatar_url FROM users WHERE google_id = ?',
          [googleId]
        );

        if (usersByGoogleId.length > 0) {
          user = usersByGoogleId[0];

          if (user.avatar_url !== avatarUrl || user.name !== name) {
            await pool.query(
              'UPDATE users SET avatar_url = ?, name = ? WHERE id = ?',
              [avatarUrl, name, user.id]
            );
            user.avatar_url = avatarUrl;
            user.name = name;
          }

        } else {
          const [usersByEmail] = await pool.query(
            'SELECT id, email, name, google_id, avatar_url FROM users WHERE email = ?',
            [email]
          );

          if (usersByEmail.length > 0) {
            user = usersByEmail[0];
            await pool.query(
              'UPDATE users SET google_id = ?, avatar_url = ?, name = ? WHERE id = ?',
              [googleId, avatarUrl, name, user.id]
            );
            user.google_id = googleId;
            user.avatar_url = avatarUrl;
            user.name = name;
          } else {
            const [result] = await pool.query(
              'INSERT INTO users (email, name, google_id, password_hash, avatar_url) VALUES (?, ?, ?, NULL, ?)',
              [email, name || 'Google User', googleId, avatarUrl]
            );

            const [newUser] = await pool.query(
              'SELECT id, email, name, google_id, avatar_url FROM users WHERE id = ?',
              [result.insertId]
            );

            if (!newUser.length) throw new Error('Failed to fetch new user');

            user = newUser[0];
          }
        }

        const jwtSecret = process.env.JWT_SECRET;
        if (!jwtSecret) throw new Error('JWT_SECRET not defined');
        if (!user?.id || !user?.email) throw new Error('Incomplete user data for JWT');

        const token = jwt.sign(
          {
            userId: user.id,
            email: user.email,
            name: user.name,
            avatarUrl: user.avatar_url
          },
          jwtSecret,
          { expiresIn: '1h' }
        );

        done(null, { token });

      } catch (err) {
        console.error('Google strategy error:', err);
        done(err, null);
      }
    }
  )
);
