/* global describe, it */

/*
 * The MIT License (MIT)
 *
 * Copyright (c) 2014 Apigee Corporation
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the 'Software'), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

'use strict';

// Here to quiet down Connect logging errors
process.env.NODE_ENV = 'test';
// Indicate to swagger-tools that we're in testing mode
process.env.RUNNING_SWAGGER_TOOLS_TESTS = 'true';

var _ = require('lodash');
var assert = require('assert');
var helpers = require('../helpers');
var path = require('path');
var pkg = require('../../package.json');
var request = require('supertest');

var swaggerObject = _.cloneDeep(require('../../samples/2.0/petstore.json'));

describe('Swagger UI Middleware v2.0', function () {
  it('should serve Swagger documents at /api-docs by default', function (done) {
    helpers.createServer([swaggerObject], {}, function (app) {
      request(app)
        .get('/api-docs')
        .expect(200)
        .end(helpers.expectContent(swaggerObject, done));
    });
  });

  it('should serve Swagger documents at requested location', function (done) {
    helpers.createServer([swaggerObject], {
      swaggerUiOptions: {
        apiDocs: '/api-docs2'
      }
    }, function (app) {
      request(app)
      .get('/api-docs2')
        .expect(200)
      .end(helpers.expectContent(swaggerObject, done));
    });
  });

  it('should serve Swagger UI at /docs by default', function (done) {
    helpers.createServer([swaggerObject], {}, function (app) {
      request(app)
        .get('/docs/') // Trailing slash to avoid a 303
        .expect(200)
        .expect('content-type', 'text/html; charset=UTF-8')
        .expect('swagger-api-docs-url', '/api-docs')
        .end(done);
    });
  });

  it('should serve Swagger UI at requested location', function (done) {
    helpers.createServer([swaggerObject], {
      swaggerUiOptions: {
        swaggerUi: '/docs2'
      }
    }, function (app) {
      request(app)
        .get('/docs2/') // Trailing slash to avoid a 303
        .expect(200)
        .expect('content-type', 'text/html; charset=UTF-8')
        .expect('swagger-api-docs-url', '/api-docs')
        .end(done);
    });
  });

  describe('issues', function () {
    describe('serve custom swagger-ui (Issue 111)', function () {
      it('should throw error when path points to missing directory', function (done) {
        try {
          helpers.createServer([swaggerObject], {
            swaggerUiOptions: {
              swaggerUiDir: '../browser'
            }
          }, function () {
            done(new Error('Should not initialize with options.swaggerUiDir pointing to a missing path'));
          });
        } catch (err) {
          assert.ok(err.message.indexOf('options.swaggerUiDir path does not exist: ') === 0);

          done();
        }
      });

      it('should throw error when path points to a file', function (done) {
        try {
          helpers.createServer([swaggerObject], {
            swaggerUiOptions: {
              swaggerUiDir: path.join(__dirname, '..', '..', 'package.json')
            }
          }, function () {
            done(new Error('Should not initialize with options.swaggerUiDir pointing to a file'));
          });
        } catch (err) {
          assert.ok(err.message.indexOf('options.swaggerUiDir path is not a directory: ') === 0);

          done();
        }
      });

      it('should serve the content at the specified path', function (done) {
        // This is a convoluted example but since all we have to do is show that the path sent to serve-static is served
        // as requested, that's all this test needs to do.
        helpers.createServer([swaggerObject], {
          swaggerUiOptions: {
            swaggerUiDir: path.join(__dirname, '..', '..')
          }
        }, function (app) {
          request(app)
            .get('/docs/package.json')
            .expect(200)
            .expect('content-type', /application\/json/)
            .end(function (err, res) {
              if (err) {
                return done(err);
              }

              assert.deepEqual(JSON.parse(res.text), pkg);

              done();
            });
        });
      });
    });

    it('should serve Swagger UI with Swagger UI Prefix setting (issue #297)', function (done) {
      helpers.createServer([swaggerObject], {
        swaggerUiOptions: {
          swaggerUi: '/docs2',
          swaggerUiPrefix: '/something'
        }
      }, function (app) {
        request(app)
          .get('/docs2/') // Trailing slash to avoid a 303
          .expect(200)
          .expect('content-type', 'text/html; charset=UTF-8')
          .expect('swagger-api-docs-url', '/something/api-docs')
          .end(done);
      });
    });

    it('should serve Swagger document at explicit path (Issue 183)', function (done) {
      helpers.createServer([swaggerObject], {
        swaggerUiOptions: {
          apiDocs: '/swagger.json'
        }
      }, function (app) {
        request(app)
          .get('/swagger.json')
          .expect(200)
          .end(helpers.expectContent(swaggerObject, done));
      });
    });

    it('should serve swagger-ui from a mount point (Issue 256)', function (done) {
      helpers.createServer([swaggerObject], {
        mountPoint: '/foo'
      }, function (app) {
        request(app)
          .get('/foo/docs/') // Trailing slash to avoid a 303
          .expect(200)
          .end(function (err, res) {
            if (err) {
              return done(err);
            }

            assert.equal(res.header['swagger-api-docs-url'], '/foo/api-docs');

            done();
          });
      });
    });
  });
});
