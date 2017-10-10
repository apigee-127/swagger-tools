/* global describe, it */

/*
 * The MIT License (MIT)
 *
 * Copyright (c) 2014 Apigee Corporation
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
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
var request = require('supertest');

var petStoreJson = _.cloneDeep(require('../../samples/2.0/petstore.json'));

var SecurityDef = function (allow, delay) {
  var self = this;

  if (allow === undefined) {
    allow = true;
  }

  if (delay === undefined) {
    delay = 0;
  }

  this.called = false;

  this.func = function (request, securityDefinition, scopes, cb) {
    assert(Array.isArray(scopes));

    self.called = true;

    setTimeout(function() {
      cb(allow ? null : new Error('disallowed'));
    }, delay);
  };
};
var ApiKeySecurityDef = function() {
  var self = this;
  this.apiKey = undefined;
  this.func = function(request, securityDefinition, key, cb) {
    assert(key);
    self.apiKey = key;
    cb();
  };
};

// Create security definitions
petStoreJson.securityDefinitions.local = petStoreJson.securityDefinitions.local2 = {
  type: 'oauth2',
  scopes: {
    read: 'allow read'
  },
  flow: 'accessCode',
  authorizationUrl: 'http://localhost/authorize',
  tokenUrl: 'http://localhost/token'
};
petStoreJson.securityDefinitions.apiKeyQuery = {
  type: 'apiKey',
  name: 'apiKey',
  in: 'query'
};
petStoreJson.securityDefinitions.apiKeyHeader = {
  type: 'apiKey',
  name: 'X-API-KEY',
  in: 'header'
};

// Create paths
var swaggerRouterOptions = {
  controllers: {}
};

_.forEach([
  'secured',
  'securedAnd',
  'securedOr',
  'unsecured',
  'securedApiKeyQuery',
  'securedApiKeyHeader'], function (name) {
    var path = '/' + name;
    var cPathDef = _.cloneDeep(petStoreJson.paths['/pets']);
    var security;

    // Delete the 'post' operation
    delete cPathDef.post;

    // Set the operationId
    cPathDef.get.operationId = name;

    // Add security
    switch (name) {
    case 'secured':
      security = [
        {
          local: ['read']
        }
      ];
      break;

    case 'securedAnd':
      security = [
        {
          local: ['read']
        }, {
          local2: ['read']
        }
      ];
      break;

    case 'securedOr':
      security = [
        {
          local: ['read']
        }, {
          local2: ['read']
        }
      ];
      break;

    case 'securedApiKeyQuery':
      security = [
        {
          apiKeyQuery: []
        }
      ];
      break;

    case 'securedApiKeyHeader':
      security = [
        {
          apiKeyHeader: []
        }
      ];
    }

    if (_.isUndefined(security)) {
      delete cPathDef.get.security;
    } else {
      cPathDef.get.security = security;
    }

    // Add the path
    petStoreJson.paths[path] = cPathDef;

    // Create handler
    swaggerRouterOptions.controllers[name] = function (req, res) {
      res.end('OK');
    };
  });

// Delete global security
delete petStoreJson.security;

describe('Swagger Security Middleware v2.0', function () {
  it('should call middleware when secured', function(done) {
    var localDef = new SecurityDef();

    helpers.createServer([petStoreJson], {
      swaggerRouterOptions: swaggerRouterOptions,
      swaggerSecurityOptions: {
        local: localDef.func
      }
    }, function (app) {
      request(app)
        .get('/api/secured')
        .expect(200)
        .end(function(err, res) {
          helpers.expectContent('OK')(err, res);

          assert(localDef.called);

          done();
        });
    });
  });

  it('should not call middleware when unsecured', function (done) {
    var localDef = new SecurityDef();

    helpers.createServer([petStoreJson], {
      swaggerRouterOptions: swaggerRouterOptions,
      swaggerSecurityOptions: {
        local: localDef.func
      }
    }, function (app) {
      request(app)
        .get('/api/unsecured')
        .expect(200)
        .end(function(err, res) {
          helpers.expectContent('OK')(err, res);

          assert(!localDef.called);

          done();
        });
    });
  });

  it('should not authorize if handler denies', function(done) {
    var localDef = new SecurityDef(false);

    helpers.createServer([petStoreJson], {
      swaggerRouterOptions: swaggerRouterOptions,
      swaggerSecurityOptions: {
        local: localDef.func
      }
    }, function (app) {
      request(app)
        .get('/api/secured')
        .expect(403)
        .end(done);
    });
  });

  describe('with global requirements', function () {
    it('should call global middleware when unsecured locally', function (done) {
      var cPetStoreJson = _.cloneDeep(petStoreJson);
      var globalDef = new SecurityDef();
      var localDef = new SecurityDef();

      cPetStoreJson.security = [
        {
          oauth2: ['read']
        }
      ];

      helpers.createServer([cPetStoreJson], {
        swaggerRouterOptions: swaggerRouterOptions,
        swaggerSecurityOptions: {
          oauth2: globalDef.func,
          local: localDef.func
        }
      }, function (app) {
        request(app)
          .get('/api/unsecured')
          .expect(200)
          .end(function(err) {
            if (err) { return done(err); }

            assert(globalDef.called);
            assert(!localDef.called);

            done();
          });
      });
    });

    it('should call local middleware when secured locally', function (done) {
      var cPetStoreJson = _.cloneDeep(petStoreJson);
      var globalDef = new SecurityDef();
      var localDef = new SecurityDef();

      cPetStoreJson.security = [
        {
          oauth2: ['read']
        }
      ];

      helpers.createServer([cPetStoreJson], {
        swaggerRouterOptions: swaggerRouterOptions,
        swaggerSecurityOptions: {
          oauth2: globalDef.func,
          local: localDef.func
        }
      }, function (app) {
        request(app)
          .get('/api/secured')
          .expect(200)
          .end(function(err) {
            if (err) { return done(err); }

            assert(localDef.called);
            assert(!globalDef.called);

            done();
          });
      });
    });

    it('should not authorize if handler denies', function (done) {
      var cPetStoreJson = _.cloneDeep(petStoreJson);
      var globalDef = new SecurityDef(false);
      var localDef = new SecurityDef(true);

      cPetStoreJson.security = [
        {
          oauth2: ['read']
        }
      ];

      helpers.createServer([cPetStoreJson], {
        swaggerSecurityOptions: {
          oauth2: globalDef.func,
          local: localDef.func
        }
      }, function (app) {
        request(app)
          .get('/api/unsecured')
          .expect(403)
          .end(done);
      });
    });
  });

  describe('API Key support', function() {
    it('in header', function (done) {
      var cPetStoreJson = _.cloneDeep(petStoreJson);
      var security = new ApiKeySecurityDef();
      var API_KEY = 'abc123';

      helpers.createServer([cPetStoreJson], {
          swaggerRouterOptions: swaggerRouterOptions,
          swaggerSecurityOptions: {
            apiKeyHeader: security.func
          }
        },
        function(app) {
          request(app)
            .get('/api/securedApiKeyHeader')
            .set({ 'X-API-KEY': API_KEY })
            .expect(200)
            .end(function(err) {
              if (err) { return done(err); }

              assert(security.apiKey === API_KEY);

              done();
            });
        });
    });

    it('in query', function (done) {
      var cPetStoreJson = _.cloneDeep(petStoreJson);
      var security = new ApiKeySecurityDef();
      var API_KEY = 'abc123';

      helpers.createServer([cPetStoreJson], {
        swaggerRouterOptions: swaggerRouterOptions,
        swaggerSecurityOptions: {
          apiKeyQuery: security.func
        }
      },
        function(app) {
          request(app)
            .get('/api/securedApiKeyQuery')
            .query({ apiKey: API_KEY })
            .expect(200)
            .end(function(err) {
              if (err) { return done(err); }

              assert(security.apiKey === API_KEY);

              done();
            });
        });
    });

  });

  describe('AND requirements', function() {
    it('should authorize if both are true', function (done) {
      var local = new SecurityDef(true);
      var local2 = new SecurityDef(true);

      helpers.createServer([petStoreJson], {
        swaggerRouterOptions: swaggerRouterOptions,
        swaggerSecurityOptions: {
          local: local.func,
          local2: local2.func
        }
      }, function (app) {
        request(app)
          .get('/api/securedAnd')
          .expect(200)
          .end(helpers.expectContent('OK', done));
      });
    });

    it('should not authorize if first is false', function (done) {
      var local = new SecurityDef(false);
      var local2 = new SecurityDef(true);

      helpers.createServer([petStoreJson], {
        swaggerRouterOptions: swaggerRouterOptions,
        swaggerSecurityOptions: {
          local: local.func,
          local2: local2.func
        }
      }, function (app) {
        request(app)
          .get('/api/securedAnd')
          .expect(200)
          .end(helpers.expectContent('OK', done));
      });
    });

    it('should not authorize if second is false', function (done) {
      var local = new SecurityDef(true);
      var local2 = new SecurityDef(false);

      helpers.createServer([petStoreJson], {
        swaggerRouterOptions: swaggerRouterOptions,
        swaggerSecurityOptions: {
          local: local.func,
          local2: local2.func
        }
      }, function (app) {
        request(app)
          .get('/api/securedAnd')
          .expect(200)
          .end(helpers.expectContent('OK', done));
      });
    });

    it('should not authorize if both are false', function(done) {
      var local = new SecurityDef(false);
      var local2 = new SecurityDef(false);

      helpers.createServer([petStoreJson], {
        swaggerSecurityOptions: {
          local: local.func,
          local2: local2.func
        }
      }, function (app) {
        request(app)
          .get('/api/securedAnd')
          .expect(403)
          .end(done);
      });
    });
  });

  describe('OR requirements', function() {
    it('should authorize if both are true', function(done) {
      var local = new SecurityDef(true);
      var local2 = new SecurityDef(true);

      helpers.createServer([petStoreJson], {
        swaggerRouterOptions: swaggerRouterOptions,
        swaggerSecurityOptions: {
          local: local.func,
          local2: local2.func
        }
      }, function (app) {
        request(app)
          .get('/api/securedOr')
          .expect(200)
          .end(helpers.expectContent('OK', done));
      });
    });

    it('should authorize first if both are true', function(done) {
      var local = new SecurityDef(true, 400);
      var local2 = new SecurityDef(true);

      helpers.createServer([petStoreJson], {
        swaggerRouterOptions: swaggerRouterOptions,
        swaggerSecurityOptions: {
          local: local.func,
          local2: local2.func
        }
      }, function (app) {
        request(app)
          .get('/api/securedOr')
          .expect(200)
          .end(function(err, res) {
            helpers.expectContent('OK')(err, res);

            assert(!local2.called);

            done();
          });
      });
    });

    it('should authorize if first is true', function(done) {
      var local = new SecurityDef(true);
      var local2 = new SecurityDef(false);

      helpers.createServer([petStoreJson], {
        swaggerRouterOptions: swaggerRouterOptions,
        swaggerSecurityOptions: {
          local: local.func,
          local2: local2.func
        }
      }, function (app) {
        request(app)
          .get('/api/securedOr')
          .expect(200)
          .end(helpers.expectContent('OK', done));
      });
    });

    it('should authorize if second is true', function(done) {
      var local = new SecurityDef(false);
      var local2 = new SecurityDef(true);

      helpers.createServer([petStoreJson], {
        swaggerRouterOptions: swaggerRouterOptions,
        swaggerSecurityOptions: {
          local: local.func,
          local2: local2.func
        }
      }, function (app) {
        request(app)
          .get('/api/securedOr')
          .expect(200)
          .end(helpers.expectContent('OK', done));
      });
    });

    it('should not authorize if both are false', function(done) {
      var local = new SecurityDef(false);
      var local2 = new SecurityDef(false);

      helpers.createServer([petStoreJson], {
        swaggerSecurityOptions: {
          local: local.func,
          local2: local2.func
        }
      }, function (app) {
        request(app)
          .get('/api/securedOr')
          .expect(403)
          .end(done);
      });
    });
  });

});
