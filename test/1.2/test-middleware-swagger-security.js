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

var petJson = _.cloneDeep(require('../../samples/1.2/pet.json'));
var rlJson = _.cloneDeep(require('../../samples/1.2/resource-listing.json'));
var storeJson = _.cloneDeep(require('../../samples/1.2/store.json'));
var userJson = _.cloneDeep(require('../../samples/1.2/user.json'));

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
rlJson.authorizations.local = rlJson.authorizations.local2 = {
  grantTypes: {
    'authorization_code': {
      tokenEndpoint: {
        tokenName: 'auth_code',
        url: 'http://petstore.swagger.wordnik.com/oauth/token'
      },
      tokenRequestEndpoint: {
        clientIdName: 'client_id',
        clientSecretName: 'client_secret',
        url: 'http://petstore.swagger.wordnik.com/oauth/requestToken'
      }
    },
    implicit: {
      loginEndpoint: {
        url: 'http://petstore.swagger.wordnik.com/oauth/dialog'
      },
      tokenName: 'access_token'
    }
  },
  scopes: [
    {
      description: 'Modify pets in your account',
      scope: 'write:pets'
    },
    {
      description: 'Read your pets',
      scope: 'read:pets'
    },
    {
      description: 'Anything (testing)',
      scope: 'test:anything'
    }
  ],
  type: 'oauth2'
};
rlJson.authorizations.apiKeyHeader = {
  type: 'apiKey',
  passAs: 'header',
  keyname: 'X-API-KEY'
};
rlJson.authorizations.apiKeyQuery = {
  type: 'apiKey',
  passAs: 'query',
  keyname: 'apiKey'
};

// Create paths
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
    var cApiDef = _.cloneDeep(petJson.apis[4]);
    var authorizations;
    var operation;

    // Delete all but the 'GET' operation
    _.forEach(cApiDef.operations, function (opDef, index) {
      if (opDef.method !== 'GET') {
        delete cApiDef.operations[index];
      } else {
        operation = opDef;
      }
    });

    // Set the path
    cApiDef.path = '/' + name;

    // Add security
    switch (name) {
    case 'secured':
      authorizations = {
        local: [
          {
            description: 'Read your',
            scope: 'read:pets'
          }
        ]
      };
      break;

    case 'securedAnd':
      authorizations = {
        local: [
          {
            description: 'Read your',
            scope: 'read:pets'
          }
        ],
        local2: [
          {
            description: 'Read your',
            scope: 'read:pets'
          }
        ]
      };
      break;

    case 'securedOr':
      authorizations = {
        local: [
          {
            description: 'Read your',
            scope: 'read:pets'
          }
        ],
        local2: [
          {
            description: 'Read your',
            scope: 'read:pets'
          }
        ]
      };
      break;

    case 'securedApiKeyQuery':
      authorizations = {
        apiKeyQuery: []
      };
      break;

    case 'securedApiKeyHeader':
      authorizations = {
        apiKeyHeader: []
      };
    }

    if (_.isUndefined(authorizations)) {
      delete cApiDef.authorizations;
    } else {
      operation.authorizations = authorizations;
    }

    // Set the operation properties
    operation.nickname = name;

    // Make parameter optional
    operation.parameters[0].required = false;

    // Add the path
    petJson.apis.push(cApiDef);

    // Create handler
    swaggerRouterOptions.controllers[name] = function (req, res) {
      res.end('OK');
    };
  });

// Delete global security
delete petJson.authorizations;

describe('Swagger Security Middleware v1.2', function () {
  it('should call middleware when secured', function(done) {
    var localDef = new SecurityDef();

    helpers.createServer([rlJson, [petJson, storeJson, userJson]], {
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

    helpers.createServer([rlJson, [petJson, storeJson, userJson]], {
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

    helpers.createServer([rlJson, [petJson, storeJson, userJson]], {
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

  // Not possible due to https://github.com/swagger-api/swagger-spec/issues/159

  // describe('with global requirements', function () {
  //   it('should call global middleware when unsecured locally', function (done) {
  //     var cPetJson = _.cloneDeep(petJson);
  //     var globalDef = new SecurityDef();
  //     var localDef = new SecurityDef();
  //
  //     cPetJson.authorizations = {
  //       oauth2: [
  //         {
  //           description: 'Read your pets',
  //           scope: 'read:pets'
  //         }
  //       ]
  //     };
  //
  //     helpers.createServer([rlJson, [cPetJson, storeJson, userJson]], {
  //       swaggerSecurityOptions: {
  //         oauth2: globalDef.func,
  //         local: localDef.func
  //       }
  //     }, function (app) {
  //       request(app)
  //         .get('/api/unsecured')
  //         .expect(200)
  //         .end(function(err) {
  //           if (err) { return done(err); }
  //
  //           assert(globalDef.called);
  //           assert(!localDef.called);
  //
  //           done();
  //         });
  //     });
  //   });
  //
  //   it('should call local middleware when secured locally', function (done) {
  //     var cPetJson = _.cloneDeep(petJson);
  //     var globalDef = new SecurityDef();
  //     var localDef = new SecurityDef();
  //
  //     cPetJson.authorizations = {
  //       oauth2: [
  //         {
  //           description: 'Read your pets',
  //           scope: 'read:pets'
  //         }
  //       ]
  //     };
  //
  //     helpers.createServer([rlJson, [cPetJson, storeJson, userJson]], {
  //       swaggerSecurityOptions: {
  //         oauth2: globalDef.func,
  //         local: localDef.func
  //       }
  //     }, function (app) {
  //       request(app)
  //         .get('/api/secured')
  //         .expect(200)
  //         .end(function(err) {
  //           if (err) { return done(err); }
  //
  //           assert(localDef.called);
  //           assert(!globalDef.called);
  //
  //           done();
  //         });
  //     });
  //   });
  //
  //   it('should not authorize if handler denies', function (done) {
  //     var cPetJson = _.cloneDeep(petJson);
  //     var globalDef = new SecurityDef(false);
  //     var localDef = new SecurityDef(true);
  //
  //     cPetJson.authorizations = {
  //       oauth2: [
  //         {
  //           description: 'Read your pets',
  //           scope: 'read:pets'
  //         }
  //       ]
  //     };
  //
  //     helpers.createServer([rlJson, [cPetJson, storeJson, userJson]], {
  //       swaggerSecurityOptions: {
  //         oauth2: globalDef.func,
  //         local: localDef.func
  //       }
  //     }, function (app) {
  //       request(app)
  //         .get('/api/unsecured')
  //         .expect(403)
  //         .end(done);
  //     });
  //   });
  // });

  describe('API Key support', function() {
    it('in header', function (done) {
      var security = new ApiKeySecurityDef();
      var API_KEY = 'abc123';

      helpers.createServer([rlJson, [petJson, storeJson, userJson]], {
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
      var security = new ApiKeySecurityDef();
      var API_KEY = 'abc123';

      helpers.createServer([rlJson, [petJson, storeJson, userJson]], {
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

      helpers.createServer([rlJson, [petJson, storeJson, userJson]], {
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

      helpers.createServer([rlJson, [petJson, storeJson, userJson]], {
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

      helpers.createServer([rlJson, [petJson, storeJson, userJson]], {
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

      helpers.createServer([rlJson, [petJson, storeJson, userJson]], {
        swaggerRouterOptions: swaggerRouterOptions,
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

      helpers.createServer([rlJson, [petJson, storeJson, userJson]], {
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

      helpers.createServer([rlJson, [petJson, storeJson, userJson]], {
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

      helpers.createServer([rlJson, [petJson, storeJson, userJson]], {
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

      helpers.createServer([rlJson, [petJson, storeJson, userJson]], {
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

      helpers.createServer([rlJson, [petJson, storeJson, userJson]], {
        swaggerRouterOptions: swaggerRouterOptions,
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
