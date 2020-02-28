const app = require('connect')();
const http = require('http');
const swaggerTools = require('swagger-tools');

const PORT = 3000;

// swaggerRouter configuration
const options = {
  controllers: './controllers',
  useStubs: process.env.NODE_ENV === 'development', // Conditionally turn on stubs (mock mode)
};

// The Swagger document (require it, build it programmatically, fetch it from a URL, ...)
const swaggerDoc = require('./api/swagger.json');

// Initialize the Swagger middleware
swaggerTools.initializeMiddleware(swaggerDoc, middleware => {
  // Interpret Swagger resources and attach metadata to request - must be first in swagger-tools middleware chain
  app.use(middleware.swaggerMetadata());

  // Validate Swagger requests
  app.use(middleware.swaggerValidator());

  // Route validated requests to appropriate controller
  app.use(middleware.swaggerRouter(options));

  // Serve the Swagger documents and Swagger UI
  app.use(middleware.swaggerUi());

  // Start the server
  http.createServer(app).listen(PORT, () => {
    console.log(
      `Server is listening on port ${PORT} --> Swagger docs: http://localhost:${PORT}/docs/`,
    );
  });
});
