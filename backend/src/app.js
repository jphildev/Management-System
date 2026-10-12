const express = require('express');
const requestLogger = require('./middleware/requestLogger');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');
const routes = require('./routes');

const app = express();

// Integration contract: keep this exact order.
app.use(express.json());
app.use(requestLogger());
app.use('/api', routes);
app.use(notFound);
app.use(errorHandler);

module.exports = app;
