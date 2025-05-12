require('./utils.js');
require('dotenv').config();

const express = require('express');
const path = require('path');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const bcrypt = require('bcrypt');
const Joi = require('joi');
const { ObjectId } = require('mongodb');

const {
  MONGODB_HOST,
  MONGODB_USER,
  MONGODB_PASSWORD,
  MONGODB_DATABASE,
  MONGODB_SESSION_SECRET,
  NODE_SESSION_SECRET
} = process.env;

const saltRounds = 12;
const expireTime = 60 * 60 * 1000;  // 1 hour
const port = process.env.PORT || 3000;

const { database } = include('databaseConnection');
const userCollection = database.db(MONGODB_DATABASE).collection('users');

// express setup
const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));

// — session store 
const mongoUrl =
  `mongodb+srv://${encodeURIComponent(MONGODB_USER)}:` +
  `${encodeURIComponent(MONGODB_PASSWORD)}@` +
  `${MONGODB_HOST}/sessions`;  

const mongoStore = MongoStore.create({
  mongoUrl,
  crypto: { secret: MONGODB_SESSION_SECRET },
  ttl: expireTime / 1000
});

app.use(session({
  secret: NODE_SESSION_SECRET,
  store: mongoStore,
  saveUninitialized: false,
  resave: true,
  cookie: { maxAge: expireTime }
}));

// auth middleware 
function requireLogin(req, res, next) {
  if (!req.session.authenticated) {
    return res.redirect('/login');
  }
  next();
}

async function requireAdmin(req, res, next) {
  if (!req.session.authenticated) {
    return res.redirect('/login');
  }

  const user = await userCollection.findOne({ name: req.session.username });
  if (!user || user.user_type !== 'admin') {
    return res
      .status(403)
      .render('403', { title: 'Forbidden', session: req.session });
  }

  req.session.user_type = user.user_type;
  next();
}

// Routes

// Home page
app.get('/', (req, res) => {
  res.render('index', {
    title: 'Home',
    session: req.session
  });
});

// Sign Up
app.get('/signup', (req, res) => {
  res.render('signup', {
    title: 'Sign Up',
    error: null,
    session: req.session
  });
});

app.post('/signup', async (req, res) => {
  const schema = Joi.object({
    name: Joi.string().required(),
    email: Joi.string().email().required(),
    password: Joi.string().min(3).required()
  });
  const { error, value } = schema.validate(req.body);
  if (error) {
    return res.render('signup', {
      title: 'Sign Up',
      error: error.message,
      session: req.session
    });
  }

  const hashed = await bcrypt.hash(value.password, saltRounds);
  await userCollection.insertOne({
    name: value.name,
    email: value.email,
    password: hashed,
    user_type: 'user'
  });

  req.session.authenticated = true;
  req.session.username = value.name;
  req.session.user_type = 'user';
  req.session.user = { name: value.name, user_type: 'user' };
  res.redirect('/members');
});

// Log In 
app.get('/login', (req, res) => {
  res.render('login', {
    title: 'Log In',
    error: null,
    session: req.session
  });
});

app.post('/login', async (req, res) => {
  const schema = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required()
  });
  const { error, value } = schema.validate(req.body);
  if (error) {
    return res.render('login', {
      title: 'Log In',
      error: error.message,
      session: req.session
    });
  }

  const user = await userCollection.findOne({ email: value.email });
  if (!user || !await bcrypt.compare(value.password, user.password)) {
    return res.render('login', {
      title: 'Log In',
      error: 'Invalid email/password.',
      session: req.session
    });
  }

  req.session.authenticated = true;
  req.session.username = user.name;
  req.session.user_type = user.user_type;
  req.session.user = { name: user.name, user_type: user.user_type };
  res.redirect('/members');
});

// Members page
app.get('/members', requireLogin, (req, res) => {
  const images = ['gif1.gif', 'gif2.gif', 'gif3.gif'];
  res.render('members', {
    title: 'Members',
    session: req.session,
    images
  });
});

// Admin page: list, promote, demote
app.get('/admin', requireLogin, requireAdmin, async (req, res) => {
  const allUsers = await userCollection.find().toArray();
  res.render('admin', {
    title: 'Admin',
    session: req.session,
    users: allUsers
  });
});

app.get('/admin/promote/:id', requireLogin, requireAdmin, async (req, res) => {
  await userCollection.updateOne(
    { _id: new ObjectId(req.params.id) },
    { $set: { user_type: 'admin' } }
  );
  res.redirect('/admin');
});

app.get('/admin/demote/:id', requireLogin, requireAdmin, async (req, res) => {
  await userCollection.updateOne(
    { _id: new ObjectId(req.params.id) },
    { $set: { user_type: 'user' } }
  );
  res.redirect('/admin');
});

// Log Out
app.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) console.error(err);
    res.redirect('/');
  });
});

// 404
app.use((req, res) => {
  res.status(404).render('404', {
    title: 'Page Not Found',
    session: req.session
  });
});

// Start server
app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
