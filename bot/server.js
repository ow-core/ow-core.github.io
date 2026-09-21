const crypto = require('node:crypto');
const express = require('express');
const session = require('express-session');
require('dotenv').config();
const client = require('./index');

const app = express();
const port = process.env.PORT || 7112;
const clientId = process.env.CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET;
const publicUrl = process.env.PUBLIC_URL || 'https://bovine-amiable-chalice.ngrok-free.dev';
const redirectUri = process.env.DISCORD_REDIRECT_URI || 'https://ow-core.github.io';
const frontendUrl = process.env.FRONTEND_URL || 'https://ow-core.github.io';

if (!clientId || !clientSecret || !redirectUri || !process.env.SESSION_SECRET) {
    throw new Error('Add CLIENT_ID, CLIENT_SECRET, DISCORD_REDIRECT_URI, and SESSION_SECRET to bot/.env.');
}

app.use(express.json({ limit: '100kb' }));
app.use((request, response, next) => {
    if (request.headers.origin === frontendUrl) {
        response.setHeader('Access-Control-Allow-Origin', frontendUrl);
        response.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    if (request.method === 'OPTIONS') return response.sendStatus(204);
    next();
});

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 1000 * 60 * 60 * 24 * 7,
    },
}));

app.get('/auth/login', (request, response) => {
    const state = crypto.randomBytes(24).toString('hex');
    request.session.oauthState = state;

    const discordUrl = new URL('https://discord.com/oauth2/authorize');
    discordUrl.searchParams.set('client_id', clientId);
    discordUrl.searchParams.set('response_type', 'code');
    discordUrl.searchParams.set('redirect_uri', redirectUri);
    discordUrl.searchParams.set('scope', 'identify');
    discordUrl.searchParams.set('state', state);

    response.redirect(discordUrl.toString());
});

app.get('/auth/discord/callback', async (request, response) => {
    const { code, state } = request.query;

    if (!code || !state || state !== request.session.oauthState) {
        return response.status(400).send('Invalid Discord login request.');
    }

    try {
        const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                grant_type: 'authorization_code',
                code,
                redirect_uri: redirectUri,
            }),
        });
        const token = await tokenResponse.json();

        if (!tokenResponse.ok) {
            throw new Error(token.error_description || 'Discord token exchange failed.');
        }

        const userResponse = await fetch('https://discord.com/api/users/@me', {
            headers: { Authorization: `${token.token_type} ${token.access_token}` },
        });
        const user = await userResponse.json();

        if (!userResponse.ok) {
            throw new Error(user.message || 'Discord profile request failed.');
        }

        request.session.user = {
            id: user.id,
            nickname: user.global_name || user.username,
            avatar: user.avatar
                ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`
                : `https://cdn.discordapp.com/embed/avatars/${Number(user.discriminator || 0) % 5}.png`,
        };
        delete request.session.oauthState;
        response.redirect(frontendUrl);
    } catch (error) {
        console.error('[auth] Discord login failed:', error);
        response.status(500).send('Discord login failed.');
    }
});

app.get('/api/me', (request, response) => {
    response.json({ user: request.session.user || null });
});

app.post('/api/panel', (request, response) => {
    if (!request.session.user) {
        return response.status(401).json({ error: 'You must be logged in.' });
    }
    if (!request.body || typeof request.body !== 'object' || Array.isArray(request.body)) {
        return response.status(400).json({ error: 'Panel data must be a JSON object.' });
    }

    client.emit('panelData', { user: request.session.user, data: request.body });
    response.status(202).json({ received: true });
});

app.post('/auth/logout', (request, response) => {
    request.session.destroy(() => response.status(204).end());
});

app.listen(port, () => {
    console.log(`Auth server listening on port ${port}.`);
});
