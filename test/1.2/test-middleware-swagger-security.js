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

var _ = require('lodash');
var assert = require('assert');
var helpers = require('../helpers');
var request = require('supertest');

var petJson = _.cloneDeep(require('../../samples/1.2/pet.json'));
var rlJson = _.cloneDeep(require('../../samples/1.2/resource-listing.json'));
var storeJson = _.cloneDeep(require('../../samples/1.2/store.json'));
var userJson = _.cloneDeep(require('../../samples/1.2/user.json'));

var SecurityDef = function (allow) {
  var self = this;

  if (allow === undefined) {
    allow = true;
  }

  this.called = false;

  this.func = function (request, securityDefinition, scopes, cb) {
    assert(Array.isArray(scopes));

    self.called = true;

    cb(allow ? null : new Error('disallowed'));
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
petJson.apis.push(_.cloneDeep(petJson.apis[4]));
petJson.apis.push(_.cloneDeep(petJson.apis[4]));
petJson.apis.push(_.cloneDeep(petJson.apis[4]));
petJson.apis.push(_.cloneDeep(petJson.apis[4]));
petJson.apis.push(_.cloneDeep(petJson.apis[4]));
petJson.apis.push(_.cloneDeep(petJson.apis[4]));

petJson.apis[5].path = '/secured';
petJson.apis[6].path = '/securedAnd';
petJson.apis[7].path = '/securedOr';
petJson.apis[8].path = '/unsecured';
petJson.apis[9].path = '/securedApiKeyHeader';
petJson.apis[10].path = '/securedApiKeyQuery';

// Add security to paths
petJson.apis[5].operations[0].authorizations = {
  local: [
    {
      description: 'Read your',
      scope: 'read:pets'
    }
  ]
};
petJson.apis[6].operations[0].authorizations = {
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
petJson.apis[7].operations[0].authorizations = {
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
petJson.apis[9].operations[0].authorizations = {
  apiKeyHeader: []
};
petJson.apis[10].operations[0].authorizations = {
  apiKeyQuery: []
};


delete petJson.authorizations;
delete petJson.apis[8].operations[0].authorizations;

petJson.apis[5].operations[0].parameters[0].required = false;
petJson.apis[6].operations[0].parameters[0].required = false;
petJson.apis[7].operations[0].parameters[0].required = false;
petJson.apis[8].operations[0].parameters[0].required = false;
petJson.apis[9].operations[0].parameters[0].required = false;
petJson.apis[10].operations[0].parameters[0].required = false;

describe('Swagger Security Middleware v1.2', function () {
  it('should call middleware when secured', function(done) {
    var localDef = new SecurityDef();

    helpers.createServer([rlJson, [petJson, storeJson, userJson]], {
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

    it('should authorize if first is true', function(done) {
      var local = new SecurityDef(true);
      var local2 = new SecurityDef(false);

      helpers.createServer([rlJson, [petJson, storeJson, userJson]], {
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
