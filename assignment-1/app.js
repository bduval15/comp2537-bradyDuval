require('./utils.js');

// Load all secrets from .env file
require('dotenv').config();

const express = require('express');
const path = require('path');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const bcrypt = require('bcrypt');
const saltRounds = 12;

const { database } = include('databaseConnection');

const port = process.env.PORT || 3000;

const app = express();

const Joi = require("joi");

// Max session length in ms (1 hr)
const expireTime = 60 * 60 * 1000;

const mongodb_host = process.env.MONGODB_HOST;
const mongodb_user = process.env.MONGODB_USER;
const mongodb_password = process.env.MONGODB_PASSWORD;
const mongodb_database = process.env.MONGODB_DATABASE;
const mongodb_session_secret = process.env.MONGODB_SESSION_SECRET;

const node_session_secret = process.env.NODE_SESSION_SECRET;

const userCollection = database.db(mongodb_database).collection('users');

app.use(express.urlencoded({ extended: false }));

app.use(
  '/gifs',
  express.static(path.join(__dirname, 'gifs'))
);

// Configure sessions in MongoDB (encrypted + 1 hr max session length)
const mongoStore = MongoStore.create({
  mongoUrl: `mongodb+srv://${mongodb_user}:${mongodb_password}@${mongodb_host}/sessions`,
  
  // Encrypts session data before storing
  crypto: { secret: mongodb_session_secret },
  ttl: expireTime / 1000
})

app.use(session({
  // Signs the cookie
  secret: node_session_secret,
  store: mongoStore,
  saveUninitialized: false,
  resave: true,
  cookie: { maxAge: expireTime }
}
));

// Home page - Shows Sign up + Login when NOT logged in
//           - Shows Members Area + Sign out when logged in
app.get('/', (req, res) => {
  if (req.session.authenticated) {

    // User athenticated home page
    res.send(`
      <h1>Hello, ${req.session.username}</h1>
      <div><button onclick="window.location.href='/members'">Members Area</button></div>
      <div><button onclick="window.location.href='/logout'">Sign Out</button></div>
    `);
  } else {

    // Non authenticated home page
    res.send(`
        <a href="/signup">Sign Up</a><br>
        <a href="/login">Log In</a>
      `);
  }
});

app.get('/signup', (req, res) => {
  res.send(`
      <h3>Sign Up:</h3>
      <form method="POST">
        <input name="name"     placeholder="Name"><br>
        <input name="email"    placeholder="Email"><br>
        <input name="password" type="password" placeholder="Password"><br>
        <br>
        <button>Submit</button>
      </form>
    `);
});

// Signup form with Joi validation + bcrypt hash
app.post('/signup', async (req, res) => {
  const { name, email, password } = req.body;

  // Validate everything with Joi
  const schema = Joi.object({
    name: Joi.string().max(20).required(),
    email: Joi.string().email().required(),
    password: Joi.string().min(3).required()
  });

  const { error } = schema.validate({ name, email, password });
  if (error) {
    return res.send(`
        <p style="color:red;">${error.details[0].message}</p>
        <a href="/signup">Try Again</a>
      `);
  }

  // Hash & store in MongoDB
  const hashed = await bcrypt.hash(password, saltRounds);
  await userCollection.insertOne({ name, email, password: hashed });

  // Create session & redirect
  req.session.authenticated = true;
  req.session.username = name;
  res.redirect('/members');
});


function renderLogin(res, errorMessage = '') {
  const errorHtml = errorMessage
    ? `<p style="color:red; margin-bottom:1em;">${errorMessage}</p>`
    : '';

  res.send(`
    <h3>Log In:</h3>
    ${errorHtml}
    <form method="POST" action="/login">
      <input name="email"    placeholder="Email"><br>
      <input name="password" type="password" placeholder="Password"><br>
      <br>
      <button>Submit</button>
    </form>
  `);
}

app.get('/login', (req, res) => {
  renderLogin(res);
});

// Login form with Joi validation + bcryt compare
app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  // Validate with Joi
  const schema = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required()
  });
  
  const { error } = schema.validate({ email, password });
  if (error) {
    // show the Joi error right under the form
    return renderLogin(res, error.details[0].message);
  }

  // Lookup & compare
  const user = await userCollection.findOne({ email });
  if (!user || !await bcrypt.compare(password, user.password)) {
    return renderLogin(
      res,
      'Invalid email/password combination. Please try again.'
    );
  }

  // Success → set session & redirect to members
  req.session.authenticated = true;
  req.session.username = user.name;
  res.redirect('/members');
});


// Members only page
app.get('/members', (req, res) => {
  if (!req.session.authenticated) {
    return res.redirect('/');
  }

  const gifs = ['gif1.gif', 'gif2.gif', 'gif3.gif'];
  const pick = gifs[Math.floor(Math.random() * gifs.length)];

  res.send(`
      <h1>Hello, ${req.session.username}.</h1>
      <img src="/gifs/${pick}" style="max-width:300px;">
      <a href="/logout">Sign Out</a><br>
    `);
});

// Sign Out and destroy the session then redirect home
app.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) console.error(err);
    res.redirect('/');
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404)
  res.send("Page not found – 404");
});

// Localhost for testing before deployment
app.listen(port, () => {
  console.log("Node application listening on port " + port);
});
