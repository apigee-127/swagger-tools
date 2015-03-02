!function(e){if("object"==typeof exports&&"undefined"!=typeof module)module.exports=e();else if("function"==typeof define&&define.amd)define([],e);else{var o;"undefined"!=typeof window?o=window:"undefined"!=typeof global?o=global:"undefined"!=typeof self&&(o=self),(o.SwaggerTools||(o.SwaggerTools={})).specs=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
(function (global){
"use strict";var _=require("lodash"),async=require("async"),helpers=require("./helpers"),JsonRefs=require("json-refs"),SparkMD5=require("spark-md5"),swaggerConverter=require("swagger-converter"),traverse=require("traverse"),validators=require("./validators");_.isPlainObject(swaggerConverter)&&(swaggerConverter=global.SwaggerConverter.convert);var documentCache={},validOptionNames=_.map(helpers.swaggerOperationMethods,function(e){return e.toLowerCase()}),addExternalRefsToValidator=function e(r,n,i){var t=_.reduce(JsonRefs.findRefs(n),function(e,r,n){return JsonRefs.isRemotePointer(n)&&e.push(r.split("#")[0]),e},[]),o=function(n,i){JsonRefs.resolveRefs({$ref:n},function(n,t){return n?i(n):void e(r,t,function(e,r){i(e,r)})})};t.length>0?async.map(t,o,function(e,n){return e?i(e):(_.each(n,function(e,n){r.setRemoteReference(t[n],e)}),void i())}):i()},createErrorOrWarning=function(e,r,n,i){i.push({code:e,message:r,path:n})},addReference=function(e,r,n,i,t){var o,a,s,c,d,u=!0,f=helpers.getSwaggerVersion(e.resolved),h=_.isArray(r)?r:JsonRefs.pathFromPointer(r),p=_.isArray(r)?JsonRefs.pathToPointer(r):r,l=_.isArray(n)?n:JsonRefs.pathFromPointer(n),g=_.isArray(n)?JsonRefs.pathToPointer(n):n;return 0===h.length?(createErrorOrWarning("INVALID_REFERENCE","Not a valid JSON Reference",l,i.errors),!1):(a=e.definitions[p],d=h[0],o="securityDefinitions"===d?"SECURITY_DEFINITION":d.substring(0,d.length-1).toUpperCase(),s="1.2"===f?h[h.length-1]:p,c="securityDefinitions"===d?"Security definition":o.charAt(0)+o.substring(1).toLowerCase(),["authorizations","securityDefinitions"].indexOf(h[0])>-1&&"scopes"===h[2]&&(o+="_SCOPE",c+=" scope"),_.isUndefined(a)?(t||createErrorOrWarning("UNRESOLVABLE_"+o,c+" could not be resolved: "+s,l,i.errors),u=!1):(_.isUndefined(a.references)&&(a.references=[]),a.references.push(g)),u)},getOrComposeSchema=function r(e,n){var i,t,o="Composed "+("1.2"===e.swaggerVersion?JsonRefs.pathFromPointer(n).pop():n),a=e.definitions[n],s=traverse(e.original),c=traverse(e.resolved);return a?(t=_.cloneDeep(s.get(JsonRefs.pathFromPointer(n))),i=_.cloneDeep(c.get(JsonRefs.pathFromPointer(n))),"1.2"===e.swaggerVersion&&(a.lineage.length>0&&(i.allOf=[],_.each(a.lineage,function(n){i.allOf.push(r(e,n))})),delete i.subTypes,_.each(i.properties,function(n,i){var o=t.properties[i];_.each(["maximum","minimum"],function(e){_.isString(n[e])&&(n[e]=parseFloat(n[e]))}),_.each(JsonRefs.findRefs(o),function(i,t){var o="#/models/"+i,a=e.definitions[o],s=JsonRefs.pathFromPointer(t);a.lineage.length>0?traverse(n).set(s.slice(0,s.length-1),r(e,o)):traverse(n).set(s.slice(0,s.length-1).concat("title"),"Composed "+i)})})),i=traverse(i).map(function(e){"id"===this.key&&_.isString(e)&&this.remove()}),i.title=o,i):void 0},createUnusedErrorOrWarning=function(e,r,n,i,t){createErrorOrWarning("UNUSED_"+r,n+" is defined but is not used: "+e,i,t)},getDocumentCache=function(e){var r=SparkMD5.hash(JSON.stringify(e)),n=documentCache[r]||_.find(documentCache,function(e){return e.resolvedId===r});return n||(n=documentCache[r]={definitions:{},original:e,resolved:void 0,swaggerVersion:helpers.getSwaggerVersion(e)}),n},handleValidationError=function(e,r){var n=new Error("The Swagger document(s) are invalid");n.errors=e.errors,n.failedValidation=!0,n.warnings=e.warnings,e.apiDeclarations&&(n.apiDeclarations=e.apiDeclarations),r(n)},normalizePath=function(e){var r=e.match(/\{(.*?)\}/g),n=[],i=e;return r&&_.each(r,function(e,r){i=i.replace(e,"{"+r+"}"),n.push(e.replace(/[{}]/g,""))}),{path:i,args:n}},validateNoExist=function(e,r,n,i,t,o){!_.isUndefined(e)&&e.indexOf(r)>-1&&createErrorOrWarning("DUPLICATE_"+n,i+" already defined: "+r,t,o)},validateSchemaConstraints=function(e,r,n,i,t){try{validators.validateSchemaConstraints(e.swaggerVersion,r,n,void 0)}catch(o){t||createErrorOrWarning(o.code,o.message,o.path,i.errors)}},processDocument=function(e,r){var n=e.swaggerVersion,i=function(r){var n=JsonRefs.pathToPointer(r),i=e.definitions[n];return i||(i=e.definitions[n]={references:[]},["definitions","models"].indexOf(JsonRefs.pathFromPointer(n)[0])>-1&&(i.cyclical=!1,i.lineage=void 0,i.parents=[])),i},t=function(e){return"1.2"===n?JsonRefs.pathFromPointer(e).pop():e},o=function c(r,n,i){var t=e.definitions[n||r];t&&_.each(t.parents,function(e){i.push(e),r!==e&&c(r,e,i)})},a="1.2"===n?"authorizations":"securityDefinitions",s="1.2"===n?"models":"definitions";switch(_.each(e.resolved[a],function(e,t){var o=[a,t];("1.2"!==n||e.type)&&(i(o),_.reduce(e.scopes,function(e,t,a){var s="1.2"===n?t.scope:a,c=o.concat(["scopes",a.toString()]),d=i(o.concat(["scopes",s]));return d.scopePath=c,validateNoExist(e,s,"AUTHORIZATION_SCOPE_DEFINITION","Authorization scope definition","1.2"===n?c.concat("scope"):c,r.warnings),e.push(s),e},[]))}),_.each(e.resolved[s],function(t,o){var a=[s,o],c=i(a);if("1.2"===n&&o!==t.id&&createErrorOrWarning("MODEL_ID_MISMATCH","Model id does not match id in models object: "+t.id,a.concat("id"),r.errors),_.isUndefined(c.lineage))switch(n){case"1.2":_.each(t.subTypes,function(n,t){var o=["models",n],c=JsonRefs.pathToPointer(o),d=e.definitions[c],u=a.concat(["subTypes",t.toString()]);!d&&e.resolved[s][n]&&(d=i(o)),addReference(e,o,u,r)&&d.parents.push(JsonRefs.pathToPointer(a))});break;default:_.each(e.original[s][o].allOf,function(r,n){var t,o=a.concat(["allOf",n.toString()]);_.isUndefined(r.$ref)||JsonRefs.isRemotePointer(r.$ref)?t=a.concat(["allOf",n.toString()]):(o.push("$ref"),t=JsonRefs.pathFromPointer(r.$ref)),_.isUndefined(traverse(e.resolved).get(t))||(i(t),c.parents.push(JsonRefs.pathToPointer(t)))})}}),n){case"2.0":_.each(e.resolved.parameters,function(n,t){var o=["parameters",t];i(o),validateSchemaConstraints(e,n,o,r)}),_.each(e.resolved.responses,function(n,t){var o=["responses",t];i(o),validateSchemaConstraints(e,n,o,r)})}_.each(e.definitions,function(i,a){var s,c,d,u=JsonRefs.pathFromPointer(a),f=traverse(e.original).get(u),h=u[0],p=h.substring(0,h.length-1).toUpperCase(),l=p.charAt(0)+p.substring(1).toLowerCase();-1!==["definitions","models"].indexOf(h)&&(s=[],c=[],d=i.lineage,_.isUndefined(d)&&(d=[],o(a,void 0,d),d.reverse(),i.lineage=_.cloneDeep(d),i.cyclical=d.length>1&&d[0]===a),i.parents.length>1&&"1.2"===n&&createErrorOrWarning("MULTIPLE_"+p+"_INHERITANCE","Child "+p.toLowerCase()+" is sub type of multiple models: "+_.map(i.parents,function(e){return t(e)}).join(" && "),u,r.errors),i.cyclical&&createErrorOrWarning("CYCLICAL_"+p+"_INHERITANCE",l+" has a circular inheritance: "+_.map(d,function(e){return t(e)}).join(" -> ")+" -> "+t(a),u.concat("1.2"===n?"subTypes":"allOf"),r.errors),_.each(d.slice(i.cyclical?1:0),function(r){var n=traverse(e.resolved).get(JsonRefs.pathFromPointer(r));_.each(Object.keys(n.properties||{}),function(e){-1===c.indexOf(e)&&c.push(e)})}),validateSchemaConstraints(e,f,u,r),_.each(f.properties,function(n,i){var t=u.concat(["properties",i]);_.isUndefined(n)||(validateSchemaConstraints(e,n,t,r),c.indexOf(i)>-1?createErrorOrWarning("CHILD_"+p+"_REDECLARES_PROPERTY","Child "+p.toLowerCase()+" declares property already declared by ancestor: "+i,t,r.errors):s.push(i))}),_.each(f.required||[],function(e,i){var t="1.2"===n?"Model":"Definition";-1===c.indexOf(e)&&-1===s.indexOf(e)&&createErrorOrWarning("MISSING_REQUIRED_"+t.toUpperCase()+"_PROPERTY",t+" requires property but it is not defined: "+e,u.concat(["required",i.toString()]),r.errors)}))}),_.each(JsonRefs.findRefs(e.original),function(n,i){"1.2"===e.swaggerVersion&&(n="#/models/"+n),JsonRefs.isRemotePointer(n)||addReference(e,n,i,r)})},validateExist=function(e,r,n,i,t,o){_.isUndefined(e)||-1!==e.indexOf(r)||createErrorOrWarning("UNRESOLVABLE_"+n,i+" could not be resolved: "+r,t,o)},processAuthRefs=function(e,r,n,i){var t="1.2"===e.swaggerVersion?"AUTHORIZATION":"SECURITY_DEFINITION",o="AUTHORIZATION"===t?"Authorization":"Security definition";"1.2"===e.swaggerVersion?_.reduce(r,function(r,a,s){var c="#/authorizations/"+s,d=n.concat([s]);return addReference(e,c,d,i)&&_.reduce(a,function(r,n,a){var s=d.concat(a.toString(),"scope"),u=c+"/scopes/"+n.scope;return validateNoExist(r,n.scope,t+"_SCOPE_REFERENCE",o+" scope reference",s,i.warnings),addReference(e,u,s,i),r.concat(n.scope)},[]),r.concat(s)},[]):_.reduce(r,function(r,a,s){return _.each(a,function(a,c){var d="#/securityDefinitions/"+c,u=n.concat(s.toString(),c);validateNoExist(r,c,t+"_REFERENCE",o+" reference",u,i.warnings),r.push(c),addReference(e,d,u,i)&&_.each(a,function(r,n){addReference(e,d+"/scopes/"+r,u.concat(n.toString()),i)})}),r},[])},resolveRefs=function(e,r){var n,i=getDocumentCache(e),t=helpers.getSwaggerVersion(e);i.resolved?r():("1.2"===t&&(e=_.cloneDeep(e),n=traverse(e),_.each(JsonRefs.findRefs(e),function(e,r){n.set(JsonRefs.pathFromPointer(r),"#/models/"+e)})),JsonRefs.resolveRefs(e,function(e,n){return e?r(e):(i.resolved=n,i.resolvedId=SparkMD5.hash(JSON.stringify(n)),void r())}))},validateAgainstSchema=function(e,r,n,i){var t=_.isString(r)?e.validators[r]:helpers.createJsonValidator(),o=function(){try{validators.validateAgainstSchema(r,n,t)}catch(e){return e.failedValidation?i(void 0,e.results):i(e)}resolveRefs(n,function(e){return i(e)})};addExternalRefsToValidator(t,n,function(e){return e?i(e):void o()})},validateDefinitions=function(e,r){_.each(e.definitions,function(n,i){var t=JsonRefs.pathFromPointer(i),o=t[0].substring(0,t[0].length-1),a="1.2"===e.swaggerVersion?t[t.length-1]:i,s="securityDefinition"===o?"SECURITY_DEFINITION":o.toUpperCase(),c="securityDefinition"===o?"Security definition":o.charAt(0).toUpperCase()+o.substring(1);0===n.references.length&&(n.scopePath&&(s+="_SCOPE",c+=" scope",t=n.scopePath),createUnusedErrorOrWarning(a,s,c,t,r.warnings))})},validateParameters=function(e,r,n,i,t,o,a){var s=[],c=!1;_.reduce(i,function(i,a,d){var u=t.concat(["parameters",d.toString()]);if(!_.isUndefined(a))return validateNoExist(i,a.name,"PARAMETER","Parameter",u.concat("name"),o.errors),"body"===a.paramType||"body"===a["in"]?(c===!0&&createErrorOrWarning("DULPICATE_API_BODY_PARAMETER","API has more than one body parameter",u,o.errors),c=!0):("path"===a.paramType||"path"===a["in"])&&(-1===n.args.indexOf(a.name)&&createErrorOrWarning("UNRESOLVABLE_API_PATH_PARAMETER","API path parameter could not be resolved: "+a.name,u.concat("name"),o.errors),s.push(a.name)),-1===e.primitives.indexOf(a.type)&&"1.2"===e.version&&addReference(r,"#/models/"+a.type,u.concat("type"),o),validateSchemaConstraints(r,a,u,o,a.skipErrors),i.concat(a.name)},[]),(_.isUndefined(a)||a===!1)&&_.each(_.difference(n.args,s),function(e){createErrorOrWarning("MISSING_API_PATH_PARAMETER","API requires path parameter but it is not defined: "+e,"1.2"===r.swaggerVersion?t.slice(0,2).concat("path"):t,o.errors)})},validateSwagger1_2=function(e,r,n,i){var t=[],o=getDocumentCache(r),a=[],s={errors:[],warnings:[],apiDeclarations:[]};a=_.reduce(r.apis,function(e,r,n){return validateNoExist(e,r.path,"RESOURCE_PATH","Resource path",["apis",n.toString(),"path"],s.errors),e.push(r.path),e},[]),processDocument(o,s),t=_.reduce(n,function(r,n,i){var c=s.apiDeclarations[i]={errors:[],warnings:[]},d=getDocumentCache(n);return validateNoExist(r,n.resourcePath,"RESOURCE_PATH","Resource path",["resourcePath"],c.errors),-1===t.indexOf(n.resourcePath)&&(validateExist(a,n.resourcePath,"RESOURCE_PATH","Resource path",["resourcePath"],c.errors),r.push(n.resourcePath)),processDocument(d,c),_.reduce(n.apis,function(r,n,i){var t=["apis",i.toString()],a=normalizePath(n.path);return r.indexOf(a.path)>-1?createErrorOrWarning("DUPLICATE_API_PATH","API path (or equivalent) already defined: "+n.path,t.concat("path"),c.errors):r.push(a.path),_.reduce(n.operations,function(r,n,i){var s=t.concat(["operations",i.toString()]);return validateNoExist(r,n.method,"OPERATION_METHOD","Operation method",s.concat("method"),c.errors),r.push(n.method),-1===e.primitives.indexOf(n.type)&&"1.2"===e.version&&addReference(d,"#/models/"+n.type,s.concat("type"),c),processAuthRefs(o,n.authorizations,s.concat("authorizations"),c),validateSchemaConstraints(d,n,s,c),validateParameters(e,d,a,n.parameters,s,c),_.reduce(n.responseMessages,function(e,r,n){var i=s.concat(["responseMessages",n.toString()]);return validateNoExist(e,r.code,"RESPONSE_MESSAGE_CODE","Response message code",i.concat(["code"]),c.errors),r.responseModel&&addReference(d,"#/models/"+r.responseModel,i.concat("responseModel"),c),e.concat(r.code)},[]),r},[]),r},[]),validateDefinitions(d,c),r},[]),validateDefinitions(o,s),_.each(_.difference(a,t),function(e){var n=a.indexOf(e);createUnusedErrorOrWarning(r.apis[n].path,"RESOURCE_PATH","Resource path",["apis",n.toString(),"path"],s.errors)}),i(void 0,s)},validateSwagger2_0=function(e,r,n){var i=getDocumentCache(r),t={errors:[],warnings:[]};processDocument(i,t),processAuthRefs(i,r.security,["security"],t),_.reduce(i.resolved.paths,function(r,n,o){var a=["paths",o],s=normalizePath(o);return r.indexOf(s.path)>-1&&createErrorOrWarning("DUPLICATE_API_PATH","API path (or equivalent) already defined: "+o,a,t.errors),validateParameters(e,i,s,n.parameters,a,t,!0),_.each(n,function(r,o){var c=[],d=a.concat(o),u=[];-1!==validOptionNames.indexOf(o)&&(processAuthRefs(i,r.security,d.concat("security"),t),_.each(r.parameters,function(e){c.push(e),u.push(e.name+":"+e["in"])}),_.each(n.parameters,function(e){var r=_.cloneDeep(e);r.skipErrors=!0,-1===u.indexOf(e.name+":"+e["in"])&&c.push(r)}),validateParameters(e,i,s,c,d,t),_.each(r.responses,function(e,r){_.isUndefined(e)||validateSchemaConstraints(i,e,d.concat("responses",r),t)}))}),r.concat(s.path)},[]),validateDefinitions(i,t),n(void 0,t)},validateSemantically=function(e,r,n,i){var t=function(e,r){i(e,helpers.formatResults(r))};"1.2"===e.version?validateSwagger1_2(e,r,n,t):validateSwagger2_0(e,r,t)},validateStructurally=function(e,r,n,i){validateAgainstSchema(e,"1.2"===e.version?"resourceListing.json":"schema.json",r,function(r,t){return r?i(r):void(t||"1.2"!==e.version?i(void 0,t):(t={errors:[],warnings:[],apiDeclarations:[]},async.map(n,function(r,n){validateAgainstSchema(e,"apiDeclaration.json",r,n)},function(e,r){return e?i(e):(_.each(r,function(e,r){t.apiDeclarations[r]=e}),void i(void 0,t))})))})},Specification=function(e){var r=function(e,r){return _.reduce(r,function(e,r,n){return e[n]=helpers.createJsonValidator(r),e}.bind(this),{})},n=function(e){var r=_.cloneDeep(this.schemas[e]);return r.id=e,r}.bind(this),i=["string","number","boolean","integer","array"];switch(e){case"1.2":this.docsUrl="https://github.com/swagger-api/swagger-spec/blob/master/versions/1.2.md",this.primitives=_.union(i,["void","File"]),this.schemasUrl="https://github.com/swagger-api/swagger-spec/tree/master/schemas/v1.2",this.schemas={"apiDeclaration.json":require("../schemas/1.2/apiDeclaration.json"),"authorizationObject.json":require("../schemas/1.2/authorizationObject.json"),"dataType.json":require("../schemas/1.2/dataType.json"),"dataTypeBase.json":require("../schemas/1.2/dataTypeBase.json"),"infoObject.json":require("../schemas/1.2/infoObject.json"),"modelsObject.json":require("../schemas/1.2/modelsObject.json"),"oauth2GrantType.json":require("../schemas/1.2/oauth2GrantType.json"),"operationObject.json":require("../schemas/1.2/operationObject.json"),"parameterObject.json":require("../schemas/1.2/parameterObject.json"),"resourceListing.json":require("../schemas/1.2/resourceListing.json"),"resourceObject.json":require("../schemas/1.2/resourceObject.json")},this.validators=r(this,{"apiDeclaration.json":_.map(["dataTypeBase.json","modelsObject.json","oauth2GrantType.json","authorizationObject.json","parameterObject.json","operationObject.json","apiDeclaration.json"],n),"resourceListing.json":_.map(["resourceObject.json","infoObject.json","oauth2GrantType.json","authorizationObject.json","resourceListing.json"],n)});break;case"2.0":this.docsUrl="https://github.com/swagger-api/swagger-spec/blob/master/versions/2.0.md",this.primitives=_.union(i,["file"]),this.schemasUrl="https://github.com/swagger-api/swagger-spec/tree/master/schemas/v2.0",this.schemas={"schema.json":require("../schemas/2.0/schema.json")},this.validators=r(this,{"schema.json":[n("schema.json")]});break;default:throw new Error(e+" is an unsupported Swagger specification version")}this.version=e};Specification.prototype.validate=function(e,r,n){switch(this.version){case"1.2":if(_.isUndefined(e))throw new Error("resourceListing is required");if(!_.isPlainObject(e))throw new TypeError("resourceListing must be an object");if(_.isUndefined(r))throw new Error("apiDeclarations is required");if(!_.isArray(r))throw new TypeError("apiDeclarations must be an array");break;case"2.0":if(_.isUndefined(e))throw new Error("swaggerObject is required");if(!_.isPlainObject(e))throw new TypeError("swaggerObject must be an object")}if("2.0"===this.version&&(n=arguments[1]),_.isUndefined(n))throw new Error("callback is required");if(!_.isFunction(n))throw new TypeError("callback must be a function");"2.0"===this.version&&(r=[]),validateStructurally(this,e,r,function(i,t){i||helpers.formatResults(t)?n(i,t):validateSemantically(this,e,r,n)}.bind(this))},Specification.prototype.composeModel=function(e,r,n){var i=helpers.getSwaggerVersion(e),t=function(i,t){var o;return i?n(i):helpers.getErrorCount(t)>0?handleValidationError(t,n):(o=getDocumentCache(e),t={errors:[],warnings:[]},processDocument(o,t),o.definitions[r]?helpers.getErrorCount(t)>0?handleValidationError(t,n):void n(void 0,getOrComposeSchema(o,r)):n())};switch(this.version){case"1.2":if(_.isUndefined(e))throw new Error("apiDeclaration is required");if(!_.isPlainObject(e))throw new TypeError("apiDeclaration must be an object");if(_.isUndefined(r))throw new Error("modelId is required");break;case"2.0":if(_.isUndefined(e))throw new Error("swaggerObject is required");if(!_.isPlainObject(e))throw new TypeError("swaggerObject must be an object");if(_.isUndefined(r))throw new Error("modelRef is required")}if(_.isUndefined(n))throw new Error("callback is required");if(!_.isFunction(n))throw new TypeError("callback must be a function");if("#"!==r.charAt(0)){if("1.2"!==this.version)throw new Error("modelRef must be a JSON Pointer");r="#/models/"+r}"1.2"===i?validateAgainstSchema(this,"apiDeclaration.json",e,t):this.validate(e,t)},Specification.prototype.validateModel=function(e,r,n,i){switch(this.version){case"1.2":if(_.isUndefined(e))throw new Error("apiDeclaration is required");if(!_.isPlainObject(e))throw new TypeError("apiDeclaration must be an object");if(_.isUndefined(r))throw new Error("modelId is required");break;case"2.0":if(_.isUndefined(e))throw new Error("swaggerObject is required");if(!_.isPlainObject(e))throw new TypeError("swaggerObject must be an object");if(_.isUndefined(r))throw new Error("modelRef is required")}if(_.isUndefined(n))throw new Error("data is required");if(_.isUndefined(i))throw new Error("callback is required");if(!_.isFunction(i))throw new TypeError("callback must be a function");this.composeModel(e,r,function(e,r){return e?i(e):void validateAgainstSchema(this,r,n,i)}.bind(this))},Specification.prototype.resolve=function(e,r,n){var i,t,o=function(e){return _.isString(r)?n(void 0,traverse(e).get(JsonRefs.pathFromPointer(r))):n(void 0,e)};if(_.isUndefined(e))throw new Error("document is required");if(!_.isPlainObject(e))throw new TypeError("document must be an object");if(2===arguments.length&&(n=arguments[1],r=void 0),!_.isUndefined(r)&&!_.isString(r))throw new TypeError("ptr must be a JSON Pointer string");if(_.isUndefined(n))throw new Error("callback is required");if(!_.isFunction(n))throw new TypeError("callback must be a function");if(i=getDocumentCache(e),"1.2"===i.swaggerVersion)throw new Error("Swagger 1.2 is not supported");return i.resolved?o(i.resolved):(t="1.2"===i.swaggerVersion?_.find(["basePath","consumes","models","produces","resourcePath"],function(r){return!_.isUndefined(e[r])})?"apiDeclaration.json":"resourceListing.json":"schema.json",void this.validate(e,function(e,r){return e?n(e):helpers.getErrorCount(r)>0?handleValidationError(r,n):o(i.resolved)}))},Specification.prototype.convert=function(e,r,n,i){var t=function(e,r){i(void 0,swaggerConverter(e,r))}.bind(this);if("1.2"!==this.version)throw new Error("Specification#convert only works for Swagger 1.2");if(_.isUndefined(e))throw new Error("resourceListing is required");if(!_.isPlainObject(e))throw new TypeError("resourceListing must be an object");if(_.isUndefined(r)&&(r=[]),!_.isArray(r))throw new TypeError("apiDeclarations must be an array");if(arguments.length<4&&(i=arguments[arguments.length-1]),_.isUndefined(i))throw new Error("callback is required");if(!_.isFunction(i))throw new TypeError("callback must be a function");n===!0?t(e,r):this.validate(e,r,function(n,o){return n?i(n):helpers.getErrorCount(o)>0?handleValidationError(o,i):void t(e,r)})},module.exports.v1=module.exports.v1_2=new Specification("1.2"),module.exports.v2=module.exports.v2_0=new Specification("2.0");
}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"../schemas/1.2/apiDeclaration.json":75,"../schemas/1.2/authorizationObject.json":76,"../schemas/1.2/dataType.json":77,"../schemas/1.2/dataTypeBase.json":78,"../schemas/1.2/infoObject.json":79,"../schemas/1.2/modelsObject.json":80,"../schemas/1.2/oauth2GrantType.json":81,"../schemas/1.2/operationObject.json":82,"../schemas/1.2/parameterObject.json":83,"../schemas/1.2/resourceListing.json":84,"../schemas/1.2/resourceObject.json":85,"../schemas/2.0/schema.json":86,"./helpers":2,"./validators":3,"async":4,"json-refs":11,"lodash":12,"spark-md5":13,"swagger-converter":17,"traverse":64}],2:[function(require,module,exports){
(function (process){
"use strict";var _=require("lodash"),JsonRefs=require("json-refs"),ZSchema=require("z-schema"),draft04Json=require("../schemas/json-schema-draft-04.json"),draft04Url="http://json-schema.org/draft-04/schema",specCache={};module.exports.createJsonValidator=function(r){var e,n=new ZSchema({reportPathAsArray:!0});if(n.setRemoteReference(draft04Url,draft04Json),_.each(["byte","double","float","int32","int64","mime-type","uri-template"],function(r){ZSchema.registerFormat(r,function(){return!0})}),!_.isUndefined(r)&&(e=n.compileSchema(r),e===!1))throw console.error("JSON Schema file"+(r.length>1?"s are":" is")+" invalid:"),_.each(n.getLastErrors(),function(r){console.error("  "+(_.isArray(r.path)?JsonRefs.pathToPointer(r.path):r.path)+": "+r.message)}),new Error("Unable to create validator due to invalid JSON Schema");return n},module.exports.formatResults=function(r){return r?r.errors.length+r.warnings.length+_.reduce(r.apiDeclarations,function(r,e){return e&&(r+=e.errors.length+e.warnings.length),r},0)>0?r:void 0:r},module.exports.getErrorCount=function(r){var e=0;return r&&(e=r.errors.length,_.each(r.apiDeclarations,function(r){r&&(e+=r.errors.length)})),e};var coerseVersion=function(r){return r&&!_.isString(r)&&(r=r.toString(),-1===r.indexOf(".")&&(r+=".0")),r};module.exports.getSpec=function(r,e){var n;if(r=coerseVersion(r),n=specCache[r],_.isUndefined(n))switch(r){case"1.2":n=require("../lib/specs").v1_2;break;case"2.0":n=require("../lib/specs").v2_0;break;default:if(e===!0)throw new Error("Unsupported Swagger version: "+r)}return n},module.exports.getSwaggerVersion=function(r){return _.isPlainObject(r)?coerseVersion(r.swaggerVersion||r.swagger):void 0};var toJsonPointer=module.exports.toJsonPointer=function(r){return"#/"+r.map(function(r){return r.replace(/~/g,"~0").replace(/\//g,"~1")}).join("/")};module.exports.printValidationResults=function(r,e,n,o,t,s){var a=function(r,e){return 1===e?r:r+"s"},i=function u(r,e,n){r&&(console.error(r+":"),console.error()),_.each(e,function(r){console.error(new Array(n+1).join(" ")+toJsonPointer(r.path)+": "+r.message),r.inner&&u(void 0,r.inner,n+2)}),r&&console.error()},c=0,l=0;console.error(),o.errors.length>0&&(c+=o.errors.length,i("API Errors",o.errors,2)),o.warnings.length>0&&(l+=o.warnings.length,i("API Warnings",o.warnings,2)),o.apiDeclarations&&o.apiDeclarations.forEach(function(r,e){if(r){var o=n[e].resourcePath||e;r.errors.length>0&&(c+=r.errors.length,i("  API Declaration ("+o+") Errors",r.errors,4)),r.warnings.length>0&&(l+=r.warnings.length,i("  API Declaration ("+o+") Warnings",r.warnings,4))}}),t&&console.error(c>0?c+" "+a("error",c)+" and "+l+" "+a("warning",l):"Validation succeeded but with "+l+" "+a("warning",l)),c>0&&s&&process.exit(1)},module.exports.swaggerOperationMethods=["DELETE","GET","HEAD","OPTIONS","PATCH","POST","PUT"];


}).call(this,require('_process'))
},{"../lib/specs":undefined,"../schemas/json-schema-draft-04.json":87,"_process":5,"json-refs":11,"lodash":12,"z-schema":74}],3:[function(require,module,exports){
"use strict";var _=require("lodash"),helpers=require("./helpers"),dateRegExp=/^([0-9]{4})-([0-9]{2})-([0-9]{2})$/,dateTimeRegExp=/^([0-9]{2}):([0-9]{2}):([0-9]{2})(.[0-9]+)?(z|([+-][0-9]{2}:[0-9]{2}))$/,isValidDate=function(e){var t,i,a;return _.isString(e)||(e=e.toString()),i=dateRegExp.exec(e),null===i?!1:(t=i[3],a=i[2],"01">a||a>"12"||"01">t||t>"31"?!1:!0)},isValidDateTime=function(e){var t,i,a,r,n,o,d;return _.isString(e)||(e=e.toString()),o=e.toLowerCase().split("t"),i=o[0],a=o.length>1?o[1]:void 0,isValidDate(i)?(r=dateTimeRegExp.exec(a),null===r?!1:(t=r[1],n=r[2],d=r[3],t>"23"||n>"59"||d>"59"?!1:!0)):!1},throwErrorWithCode=function(e,t){var i=new Error(t);throw i.code=e,i.failedValidation=!0,i};module.exports.validateAgainstSchema=function(e,t,i){var a=function(e){delete e.params,e.inner&&_.each(e.inner,function(e){a(e)})},r=_.isPlainObject(e)?_.cloneDeep(e):e;_.isUndefined(i)&&(i=helpers.createJsonValidator([r]));var n=i.validate(t,r);if(!n)try{throwErrorWithCode("SCHEMA_VALIDATION_FAILED","Failed schema validation")}catch(o){throw o.results={errors:_.map(i.getLastErrors(),function(e){return a(e),e}),warnings:[]},o}};var validateArrayType=module.exports.validateArrayType=function(e){"array"===e.type&&_.isUndefined(e.items)&&throwErrorWithCode("OBJECT_MISSING_REQUIRED_PROPERTY","Missing required property: items")};module.exports.validateContentType=function(e,t,i){var a="function"==typeof i.end,r=a?i.getHeader("content-type"):i.headers["content-type"],n=_.union(e,t);if(r||(r=a?"text/plain":"application/octet-stream"),r=r.split(";")[0],n.length>0&&(a?!0:-1!==["POST","PUT"].indexOf(i.method))&&-1===n.indexOf(r))throw new Error("Invalid content type ("+r+").  These are valid: "+n.join(", "))};var validateEnum=module.exports.validateEnum=function(e,t){_.isUndefined(t)||_.isUndefined(e)||-1!==t.indexOf(e)||throwErrorWithCode("ENUM_MISMATCH","Not an allowable value ("+t.join(", ")+"): "+e)},validateMaximum=module.exports.validateMaximum=function(e,t,i,a){var r,n,o=a===!0?"MAXIMUM_EXCLUSIVE":"MAXIMUM";_.isUndefined(a)&&(a=!1),"integer"===i?n=parseInt(e,10):"number"===i&&(n=parseFloat(e)),_.isUndefined(t)||(r=parseFloat(t),a&&n>=r?throwErrorWithCode(o,"Greater than or equal to the configured maximum ("+t+"): "+e):n>r&&throwErrorWithCode(o,"Greater than the configured maximum ("+t+"): "+e))},validateMaxItems=module.exports.validateMaxItems=function(e,t){!_.isUndefined(t)&&e.length>t&&throwErrorWithCode("ARRAY_LENGTH_LONG","Array is too long ("+e.length+"), maximum "+t)},validateMaxLength=module.exports.validateMaxLength=function(e,t){!_.isUndefined(t)&&e.length>t&&throwErrorWithCode("MAX_LENGTH","String is too long ("+e.length+" chars), maximum "+t)},validateMaxProperties=module.exports.validateMaxProperties=function(e,t){var i=_.isPlainObject(e)?Object.keys(e).length:0;!_.isUndefined(t)&&i>t&&throwErrorWithCode("MAX_PROPERTIES","Number of properties is too many ("+i+" properties), maximum "+t)},validateMinimum=module.exports.validateMinimum=function(e,t,i,a){var r,n,o=a===!0?"MINIMUM_EXCLUSIVE":"MINIMUM";_.isUndefined(a)&&(a=!1),"integer"===i?n=parseInt(e,10):"number"===i&&(n=parseFloat(e)),_.isUndefined(t)||(r=parseFloat(t),a&&r>=n?throwErrorWithCode(o,"Less than or equal to the configured minimum ("+t+"): "+e):r>n&&throwErrorWithCode(o,"Less than the configured minimum ("+t+"): "+e))},validateMinItems=module.exports.validateMinItems=function(e,t){!_.isUndefined(t)&&e.length<t&&throwErrorWithCode("ARRAY_LENGTH_SHORT","Array is too short ("+e.length+"), minimum "+t)},validateMinLength=module.exports.validateMinLength=function(e,t){!_.isUndefined(t)&&e.length<t&&throwErrorWithCode("MIN_LENGTH","String is too short ("+e.length+" chars), minimum "+t)},validateMinProperties=module.exports.validateMinProperties=function(e,t){var i=_.isPlainObject(e)?Object.keys(e).length:0;!_.isUndefined(t)&&t>i&&throwErrorWithCode("MIN_PROPERTIES","Number of properties is too few ("+i+" properties), minimum "+t)},validateMultipleOf=module.exports.validateMultipleOf=function(e,t){_.isUndefined(t)||e%t===0||throwErrorWithCode("MULTIPLE_OF","Not a multiple of "+t)},validatePattern=module.exports.validatePattern=function(e,t){!_.isUndefined(t)&&_.isNull(e.match(new RegExp(t)))&&throwErrorWithCode("PATTERN","Does not match required pattern: "+t)};module.exports.validateRequiredness=function(e,t){!_.isUndefined(t)&&t===!0&&_.isUndefined(e)&&throwErrorWithCode("REQUIRED","Is required")};var validateTypeAndFormat=module.exports.validateTypeAndFormat=function e(t,i,a,r){var n=!0;if(_.isArray(t))_.each(t,function(t,r){e(t,i,a,!0)||throwErrorWithCode("INVALID_TYPE","Value at index "+r+" is not a valid "+i+": "+t)});else switch(i){case"boolean":n=_.isBoolean(t)||-1!==["false","true"].indexOf(t);break;case"integer":n=!_.isNaN(parseInt(t,10));break;case"number":n=!_.isNaN(parseFloat(t));break;case"string":if(!_.isUndefined(a))switch(a){case"date":n=isValidDate(t);break;case"date-time":n=isValidDateTime(t)}break;case"void":n=_.isUndefined(t)}return r?n:void(n||throwErrorWithCode("INVALID_TYPE","void"!==i?"Not a valid "+(_.isUndefined(a)?"":a+" ")+i+": "+t:"Void does not allow a value"))},validateUniqueItems=module.exports.validateUniqueItems=function(e,t){_.isUndefined(t)||_.uniq(e).length===e.length||throwErrorWithCode("ARRAY_UNIQUE","Does not allow duplicate values: "+e.join(", "))};module.exports.validateSchemaConstraints=function(e,t,i,a){var r=function d(e){var t=e;return t.schema&&(i=i.concat(["schema"]),t=d(t.schema)),t},n=t.type;n||(t.schema?(t=r(t),n=t.type||"object"):n="responses"===i[i.length-2]?"void":"object");try{if("array"===n&&validateArrayType(t),_.isUndefined(a)&&(a="1.2"===e?t.defaultValue:t["default"],i=i.concat(["1.2"===e?"defaultValue":"default"])),_.isUndefined(a))return;"array"===n?_.isUndefined(t.items)?validateTypeAndFormat(a,n,t.format):validateTypeAndFormat(a,"array"===n?t.items.type:n,"array"===n&&t.items.format?t.items.format:t.format):validateTypeAndFormat(a,n,t.format),validateEnum(a,t["enum"]),validateMaximum(a,t.maximum,n,t.exclusiveMaximum),validateMaxItems(a,t.maxItems),validateMaxLength(a,t.maxLength),validateMaxProperties(a,t.maxProperties),validateMinimum(a,t.minimum,n,t.exclusiveMinimum),validateMinItems(a,t.minItems),validateMinLength(a,t.minLength),validateMinProperties(a,t.minProperties),validateMultipleOf(a,t.multipleOf),validatePattern(a,t.pattern),validateUniqueItems(a,t.uniqueItems)}catch(o){throw o.path=i,o}};


},{"./helpers":2,"lodash":12}],4:[function(require,module,exports){
(function (process){
!function(){function n(n){var e=!1;return function(){if(e)throw new Error("Callback was already called.");e=!0,n.apply(t,arguments)}}var t,e,r={};t=this,null!=t&&(e=t.async),r.noConflict=function(){return t.async=e,r};var u=Object.prototype.toString,i=Array.isArray||function(n){return"[object Array]"===u.call(n)},c=function(n,t){if(n.forEach)return n.forEach(t);for(var e=0;e<n.length;e+=1)t(n[e],e,n)},a=function(n,t){if(n.map)return n.map(t);var e=[];return c(n,function(n,r,u){e.push(t(n,r,u))}),e},o=function(n,t,e){return n.reduce?n.reduce(t,e):(c(n,function(n,r,u){e=t(e,n,r,u)}),e)},l=function(n){if(Object.keys)return Object.keys(n);var t=[];for(var e in n)n.hasOwnProperty(e)&&t.push(e);return t};"undefined"!=typeof process&&process.nextTick?(r.nextTick=process.nextTick,r.setImmediate="undefined"!=typeof setImmediate?function(n){setImmediate(n)}:r.nextTick):"function"==typeof setImmediate?(r.nextTick=function(n){setImmediate(n)},r.setImmediate=r.nextTick):(r.nextTick=function(n){setTimeout(n,0)},r.setImmediate=r.nextTick),r.each=function(t,e,r){function u(n){n?(r(n),r=function(){}):(i+=1,i>=t.length&&r())}if(r=r||function(){},!t.length)return r();var i=0;c(t,function(t){e(t,n(u))})},r.forEach=r.each,r.eachSeries=function(n,t,e){if(e=e||function(){},!n.length)return e();var r=0,u=function(){t(n[r],function(t){t?(e(t),e=function(){}):(r+=1,r>=n.length?e():u())})};u()},r.forEachSeries=r.eachSeries,r.eachLimit=function(n,t,e,r){var u=f(t);u.apply(null,[n,e,r])},r.forEachLimit=r.eachLimit;var f=function(n){return function(t,e,r){if(r=r||function(){},!t.length||0>=n)return r();var u=0,i=0,c=0;!function a(){if(u>=t.length)return r();for(;n>c&&i<t.length;)i+=1,c+=1,e(t[i-1],function(n){n?(r(n),r=function(){}):(u+=1,c-=1,u>=t.length?r():a())})}()}},s=function(n){return function(){var t=Array.prototype.slice.call(arguments);return n.apply(null,[r.each].concat(t))}},p=function(n,t){return function(){var e=Array.prototype.slice.call(arguments);return t.apply(null,[f(n)].concat(e))}},d=function(n){return function(){var t=Array.prototype.slice.call(arguments);return n.apply(null,[r.eachSeries].concat(t))}},y=function(n,t,e,r){if(t=a(t,function(n,t){return{index:t,value:n}}),r){var u=[];n(t,function(n,t){e(n.value,function(e,r){u[n.index]=r,t(e)})},function(n){r(n,u)})}else n(t,function(n,t){e(n.value,function(n){t(n)})})};r.map=s(y),r.mapSeries=d(y),r.mapLimit=function(n,t,e,r){return m(t)(n,e,r)};var m=function(n){return p(n,y)};r.reduce=function(n,t,e,u){r.eachSeries(n,function(n,r){e(t,n,function(n,e){t=e,r(n)})},function(n){u(n,t)})},r.inject=r.reduce,r.foldl=r.reduce,r.reduceRight=function(n,t,e,u){var i=a(n,function(n){return n}).reverse();r.reduce(i,t,e,u)},r.foldr=r.reduceRight;var v=function(n,t,e,r){var u=[];t=a(t,function(n,t){return{index:t,value:n}}),n(t,function(n,t){e(n.value,function(e){e&&u.push(n),t()})},function(){r(a(u.sort(function(n,t){return n.index-t.index}),function(n){return n.value}))})};r.filter=s(v),r.filterSeries=d(v),r.select=r.filter,r.selectSeries=r.filterSeries;var h=function(n,t,e,r){var u=[];t=a(t,function(n,t){return{index:t,value:n}}),n(t,function(n,t){e(n.value,function(e){e||u.push(n),t()})},function(){r(a(u.sort(function(n,t){return n.index-t.index}),function(n){return n.value}))})};r.reject=s(h),r.rejectSeries=d(h);var g=function(n,t,e,r){n(t,function(n,t){e(n,function(e){e?(r(n),r=function(){}):t()})},function(){r()})};r.detect=s(g),r.detectSeries=d(g),r.some=function(n,t,e){r.each(n,function(n,r){t(n,function(n){n&&(e(!0),e=function(){}),r()})},function(){e(!1)})},r.any=r.some,r.every=function(n,t,e){r.each(n,function(n,r){t(n,function(n){n||(e(!1),e=function(){}),r()})},function(){e(!0)})},r.all=r.every,r.sortBy=function(n,t,e){r.map(n,function(n,e){t(n,function(t,r){t?e(t):e(null,{value:n,criteria:r})})},function(n,t){if(n)return e(n);var r=function(n,t){var e=n.criteria,r=t.criteria;return r>e?-1:e>r?1:0};e(null,a(t.sort(r),function(n){return n.value}))})},r.auto=function(n,t){t=t||function(){};var e=l(n),u=e.length;if(!u)return t();var a={},f=[],s=function(n){f.unshift(n)},p=function(n){for(var t=0;t<f.length;t+=1)if(f[t]===n)return void f.splice(t,1)},d=function(){u--,c(f.slice(0),function(n){n()})};s(function(){if(!u){var n=t;t=function(){},n(null,a)}}),c(e,function(e){var u=i(n[e])?n[e]:[n[e]],f=function(n){var u=Array.prototype.slice.call(arguments,1);if(u.length<=1&&(u=u[0]),n){var i={};c(l(a),function(n){i[n]=a[n]}),i[e]=u,t(n,i),t=function(){}}else a[e]=u,r.setImmediate(d)},y=u.slice(0,Math.abs(u.length-1))||[],m=function(){return o(y,function(n,t){return n&&a.hasOwnProperty(t)},!0)&&!a.hasOwnProperty(e)};if(m())u[u.length-1](f,a);else{var v=function(){m()&&(p(v),u[u.length-1](f,a))};s(v)}})},r.retry=function(n,t,e){var u=5,i=[];"function"==typeof n&&(e=t,t=n,n=u),n=parseInt(n,10)||u;var c=function(u,c){for(var a=function(n,t){return function(e){n(function(n,r){e(!n||t,{err:n,result:r})},c)}};n;)i.push(a(t,!(n-=1)));r.series(i,function(n,t){t=t[t.length-1],(u||e)(t.err,t.result)})};return e?c():c},r.waterfall=function(n,t){if(t=t||function(){},!i(n)){var e=new Error("First argument to waterfall must be an array of functions");return t(e)}if(!n.length)return t();var u=function(n){return function(e){if(e)t.apply(null,arguments),t=function(){};else{var i=Array.prototype.slice.call(arguments,1),c=n.next();i.push(c?u(c):t),r.setImmediate(function(){n.apply(null,i)})}}};u(r.iterator(n))()};var k=function(n,t,e){if(e=e||function(){},i(t))n.map(t,function(n,t){n&&n(function(n){var e=Array.prototype.slice.call(arguments,1);e.length<=1&&(e=e[0]),t.call(null,n,e)})},e);else{var r={};n.each(l(t),function(n,e){t[n](function(t){var u=Array.prototype.slice.call(arguments,1);u.length<=1&&(u=u[0]),r[n]=u,e(t)})},function(n){e(n,r)})}};r.parallel=function(n,t){k({map:r.map,each:r.each},n,t)},r.parallelLimit=function(n,t,e){k({map:m(t),each:f(t)},n,e)},r.series=function(n,t){if(t=t||function(){},i(n))r.mapSeries(n,function(n,t){n&&n(function(n){var e=Array.prototype.slice.call(arguments,1);e.length<=1&&(e=e[0]),t.call(null,n,e)})},t);else{var e={};r.eachSeries(l(n),function(t,r){n[t](function(n){var u=Array.prototype.slice.call(arguments,1);u.length<=1&&(u=u[0]),e[t]=u,r(n)})},function(n){t(n,e)})}},r.iterator=function(n){var t=function(e){var r=function(){return n.length&&n[e].apply(null,arguments),r.next()};return r.next=function(){return e<n.length-1?t(e+1):null},r};return t(0)},r.apply=function(n){var t=Array.prototype.slice.call(arguments,1);return function(){return n.apply(null,t.concat(Array.prototype.slice.call(arguments)))}};var A=function(n,t,e,r){var u=[];n(t,function(n,t){e(n,function(n,e){u=u.concat(e||[]),t(n)})},function(n){r(n,u)})};r.concat=s(A),r.concatSeries=d(A),r.whilst=function(n,t,e){n()?t(function(u){return u?e(u):void r.whilst(n,t,e)}):e()},r.doWhilst=function(n,t,e){n(function(u){if(u)return e(u);var i=Array.prototype.slice.call(arguments,1);t.apply(null,i)?r.doWhilst(n,t,e):e()})},r.until=function(n,t,e){n()?e():t(function(u){return u?e(u):void r.until(n,t,e)})},r.doUntil=function(n,t,e){n(function(u){if(u)return e(u);var i=Array.prototype.slice.call(arguments,1);t.apply(null,i)?e():r.doUntil(n,t,e)})},r.queue=function(t,e){function u(n,t,e,u){return n.started||(n.started=!0),i(t)||(t=[t]),0==t.length?r.setImmediate(function(){n.drain&&n.drain()}):void c(t,function(t){var i={data:t,callback:"function"==typeof u?u:null};e?n.tasks.unshift(i):n.tasks.push(i),n.saturated&&n.tasks.length===n.concurrency&&n.saturated(),r.setImmediate(n.process)})}void 0===e&&(e=1);var a=0,o={tasks:[],concurrency:e,saturated:null,empty:null,drain:null,started:!1,paused:!1,push:function(n,t){u(o,n,!1,t)},kill:function(){o.drain=null,o.tasks=[]},unshift:function(n,t){u(o,n,!0,t)},process:function(){if(!o.paused&&a<o.concurrency&&o.tasks.length){var e=o.tasks.shift();o.empty&&0===o.tasks.length&&o.empty(),a+=1;var r=function(){a-=1,e.callback&&e.callback.apply(e,arguments),o.drain&&o.tasks.length+a===0&&o.drain(),o.process()},u=n(r);t(e.data,u)}},length:function(){return o.tasks.length},running:function(){return a},idle:function(){return o.tasks.length+a===0},pause:function(){o.paused!==!0&&(o.paused=!0,o.process())},resume:function(){o.paused!==!1&&(o.paused=!1,o.process())}};return o},r.priorityQueue=function(n,t){function e(n,t){return n.priority-t.priority}function u(n,t,e){for(var r=-1,u=n.length-1;u>r;){var i=r+(u-r+1>>>1);e(t,n[i])>=0?r=i:u=i-1}return r}function a(n,t,a,o){return n.started||(n.started=!0),i(t)||(t=[t]),0==t.length?r.setImmediate(function(){n.drain&&n.drain()}):void c(t,function(t){var i={data:t,priority:a,callback:"function"==typeof o?o:null};n.tasks.splice(u(n.tasks,i,e)+1,0,i),n.saturated&&n.tasks.length===n.concurrency&&n.saturated(),r.setImmediate(n.process)})}var o=r.queue(n,t);return o.push=function(n,t,e){a(o,n,t,e)},delete o.unshift,o},r.cargo=function(n,t){var e=!1,u=[],o={tasks:u,payload:t,saturated:null,empty:null,drain:null,drained:!0,push:function(n,e){i(n)||(n=[n]),c(n,function(n){u.push({data:n,callback:"function"==typeof e?e:null}),o.drained=!1,o.saturated&&u.length===t&&o.saturated()}),r.setImmediate(o.process)},process:function l(){if(!e){if(0===u.length)return o.drain&&!o.drained&&o.drain(),void(o.drained=!0);var r="number"==typeof t?u.splice(0,t):u.splice(0,u.length),i=a(r,function(n){return n.data});o.empty&&o.empty(),e=!0,n(i,function(){e=!1;var n=arguments;c(r,function(t){t.callback&&t.callback.apply(null,n)}),l()})}},length:function(){return u.length},running:function(){return e}};return o};var x=function(n){return function(t){var e=Array.prototype.slice.call(arguments,1);t.apply(null,e.concat([function(t){var e=Array.prototype.slice.call(arguments,1);"undefined"!=typeof console&&(t?console.error&&console.error(t):console[n]&&c(e,function(t){console[n](t)}))}]))}};r.log=x("log"),r.dir=x("dir"),r.memoize=function(n,t){var e={},u={};t=t||function(n){return n};var i=function(){var i=Array.prototype.slice.call(arguments),c=i.pop(),a=t.apply(null,i);a in e?r.nextTick(function(){c.apply(null,e[a])}):a in u?u[a].push(c):(u[a]=[c],n.apply(null,i.concat([function(){e[a]=arguments;var n=u[a];delete u[a];for(var t=0,r=n.length;r>t;t++)n[t].apply(null,arguments)}])))};return i.memo=e,i.unmemoized=n,i},r.unmemoize=function(n){return function(){return(n.unmemoized||n).apply(null,arguments)}},r.times=function(n,t,e){for(var u=[],i=0;n>i;i++)u.push(i);return r.map(u,t,e)},r.timesSeries=function(n,t,e){for(var u=[],i=0;n>i;i++)u.push(i);return r.mapSeries(u,t,e)},r.seq=function(){var n=arguments;return function(){var t=this,e=Array.prototype.slice.call(arguments),u=e.pop();r.reduce(n,e,function(n,e,r){e.apply(t,n.concat([function(){var n=arguments[0],t=Array.prototype.slice.call(arguments,1);r(n,t)}]))},function(n,e){u.apply(t,[n].concat(e))})}},r.compose=function(){return r.seq.apply(null,Array.prototype.reverse.call(arguments))};var S=function(n,t){var e=function(){var e=this,r=Array.prototype.slice.call(arguments),u=r.pop();return n(t,function(n,t){n.apply(e,r.concat([t]))},u)};if(arguments.length>2){var r=Array.prototype.slice.call(arguments,2);return e.apply(this,r)}return e};r.applyEach=s(S),r.applyEachSeries=d(S),r.forever=function(n,t){function e(r){if(r){if(t)return t(r);throw r}n(e)}e()},"undefined"!=typeof module&&module.exports?module.exports=r:"undefined"!=typeof define&&define.amd?define([],function(){return r}):t.async=r}();


}).call(this,require('_process'))
},{"_process":5}],5:[function(require,module,exports){
function drainQueue(){if(!draining){draining=!0;for(var e,o=queue.length;o;){e=queue,queue=[];for(var r=-1;++r<o;)e[r]();o=queue.length}draining=!1}}function noop(){}var process=module.exports={},queue=[],draining=!1;process.nextTick=function(e){queue.push(e),draining||setTimeout(drainQueue,0)},process.title="browser",process.browser=!0,process.env={},process.argv=[],process.version="",process.on=noop,process.addListener=noop,process.once=noop,process.off=noop,process.removeListener=noop,process.removeAllListeners=noop,process.emit=noop,process.binding=function(){throw new Error("process.binding is not supported")},process.cwd=function(){return"/"},process.chdir=function(){throw new Error("process.chdir is not supported")},process.umask=function(){return 0};


},{}],6:[function(require,module,exports){
(function (global){
!function(o){function e(o){throw RangeError(L[o])}function n(o,e){for(var n=o.length;n--;)o[n]=e(o[n]);return o}function t(o,e){return n(o.split(S),e).join(".")}function r(o){for(var e,n,t=[],r=0,u=o.length;u>r;)e=o.charCodeAt(r++),e>=55296&&56319>=e&&u>r?(n=o.charCodeAt(r++),56320==(64512&n)?t.push(((1023&e)<<10)+(1023&n)+65536):(t.push(e),r--)):t.push(e);return t}function u(o){return n(o,function(o){var e="";return o>65535&&(o-=65536,e+=R(o>>>10&1023|55296),o=56320|1023&o),e+=R(o)}).join("")}function i(o){return 10>o-48?o-22:26>o-65?o-65:26>o-97?o-97:x}function f(o,e){return o+22+75*(26>o)-((0!=e)<<5)}function c(o,e,n){var t=0;for(o=n?P(o/m):o>>1,o+=P(o/e);o>M*C>>1;t+=x)o=P(o/M);return P(t+(M+1)*o/(o+j))}function l(o){var n,t,r,f,l,d,s,a,p,h,v=[],g=o.length,w=0,j=I,m=A;for(t=o.lastIndexOf(F),0>t&&(t=0),r=0;t>r;++r)o.charCodeAt(r)>=128&&e("not-basic"),v.push(o.charCodeAt(r));for(f=t>0?t+1:0;g>f;){for(l=w,d=1,s=x;f>=g&&e("invalid-input"),a=i(o.charCodeAt(f++)),(a>=x||a>P((b-w)/d))&&e("overflow"),w+=a*d,p=m>=s?y:s>=m+C?C:s-m,!(p>a);s+=x)h=x-p,d>P(b/h)&&e("overflow"),d*=h;n=v.length+1,m=c(w-l,n,0==l),P(w/n)>b-j&&e("overflow"),j+=P(w/n),w%=n,v.splice(w++,0,j)}return u(v)}function d(o){var n,t,u,i,l,d,s,a,p,h,v,g,w,j,m,E=[];for(o=r(o),g=o.length,n=I,t=0,l=A,d=0;g>d;++d)v=o[d],128>v&&E.push(R(v));for(u=i=E.length,i&&E.push(F);g>u;){for(s=b,d=0;g>d;++d)v=o[d],v>=n&&s>v&&(s=v);for(w=u+1,s-n>P((b-t)/w)&&e("overflow"),t+=(s-n)*w,n=s,d=0;g>d;++d)if(v=o[d],n>v&&++t>b&&e("overflow"),v==n){for(a=t,p=x;h=l>=p?y:p>=l+C?C:p-l,!(h>a);p+=x)m=a-h,j=x-h,E.push(R(f(h+m%j,0))),a=P(m/j);E.push(R(f(a,0))),l=c(t,w,u==i),t=0,++u}++t,++n}return E.join("")}function s(o){return t(o,function(o){return E.test(o)?l(o.slice(4).toLowerCase()):o})}function a(o){return t(o,function(o){return O.test(o)?"xn--"+d(o):o})}var p="object"==typeof exports&&exports,h="object"==typeof module&&module&&module.exports==p&&module,v="object"==typeof global&&global;(v.global===v||v.window===v)&&(o=v);var g,w,b=2147483647,x=36,y=1,C=26,j=38,m=700,A=72,I=128,F="-",E=/^xn--/,O=/[^ -~]/,S=/\x2E|\u3002|\uFF0E|\uFF61/g,L={overflow:"Overflow: input needs wider integers to process","not-basic":"Illegal input >= 0x80 (not a basic code point)","invalid-input":"Invalid input"},M=x-y,P=Math.floor,R=String.fromCharCode;if(g={version:"1.2.4",ucs2:{decode:r,encode:u},decode:l,encode:d,toASCII:a,toUnicode:s},"function"==typeof define&&"object"==typeof define.amd&&define.amd)define("punycode",function(){return g});else if(p&&!p.nodeType)if(h)h.exports=g;else for(w in g)g.hasOwnProperty(w)&&(p[w]=g[w]);else o.punycode=g}(this);


}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],7:[function(require,module,exports){
"use strict";function hasOwnProperty(r,e){return Object.prototype.hasOwnProperty.call(r,e)}module.exports=function(r,e,t,n){e=e||"&",t=t||"=";var o={};if("string"!=typeof r||0===r.length)return o;var a=/\+/g;r=r.split(e);var s=1e3;n&&"number"==typeof n.maxKeys&&(s=n.maxKeys);var p=r.length;s>0&&p>s&&(p=s);for(var y=0;p>y;++y){var u,c,i,l,f=r[y].replace(a,"%20"),v=f.indexOf(t);v>=0?(u=f.substr(0,v),c=f.substr(v+1)):(u=f,c=""),i=decodeURIComponent(u),l=decodeURIComponent(c),hasOwnProperty(o,i)?isArray(o[i])?o[i].push(l):o[i]=[o[i],l]:o[i]=l}return o};var isArray=Array.isArray||function(r){return"[object Array]"===Object.prototype.toString.call(r)};


},{}],8:[function(require,module,exports){
"use strict";function map(r,e){if(r.map)return r.map(e);for(var t=[],n=0;n<r.length;n++)t.push(e(r[n],n));return t}var stringifyPrimitive=function(r){switch(typeof r){case"string":return r;case"boolean":return r?"true":"false";case"number":return isFinite(r)?r:"";default:return""}};module.exports=function(r,e,t,n){return e=e||"&",t=t||"=",null===r&&(r=void 0),"object"==typeof r?map(objectKeys(r),function(n){var i=encodeURIComponent(stringifyPrimitive(n))+t;return isArray(r[n])?map(r[n],function(r){return i+encodeURIComponent(stringifyPrimitive(r))}).join(e):i+encodeURIComponent(stringifyPrimitive(r[n]))}).join(e):n?encodeURIComponent(stringifyPrimitive(n))+t+encodeURIComponent(stringifyPrimitive(r)):""};var isArray=Array.isArray||function(r){return"[object Array]"===Object.prototype.toString.call(r)},objectKeys=Object.keys||function(r){var e=[];for(var t in r)Object.prototype.hasOwnProperty.call(r,t)&&e.push(t);return e};


},{}],9:[function(require,module,exports){
"use strict";exports.decode=exports.parse=require("./decode"),exports.encode=exports.stringify=require("./encode");


},{"./decode":7,"./encode":8}],10:[function(require,module,exports){
function Url(){this.protocol=null,this.slashes=null,this.auth=null,this.host=null,this.port=null,this.hostname=null,this.hash=null,this.search=null,this.query=null,this.pathname=null,this.path=null,this.href=null}function urlParse(t,s,e){if(t&&isObject(t)&&t instanceof Url)return t;var h=new Url;return h.parse(t,s,e),h}function urlFormat(t){return isString(t)&&(t=urlParse(t)),t instanceof Url?t.format():Url.prototype.format.call(t)}function urlResolve(t,s){return urlParse(t,!1,!0).resolve(s)}function urlResolveObject(t,s){return t?urlParse(t,!1,!0).resolveObject(s):s}function isString(t){return"string"==typeof t}function isObject(t){return"object"==typeof t&&null!==t}function isNull(t){return null===t}function isNullOrUndefined(t){return null==t}var punycode=require("punycode");exports.parse=urlParse,exports.resolve=urlResolve,exports.resolveObject=urlResolveObject,exports.format=urlFormat,exports.Url=Url;var protocolPattern=/^([a-z0-9.+-]+:)/i,portPattern=/:[0-9]*$/,delims=["<",">",'"',"`"," ","\r","\n","	"],unwise=["{","}","|","\\","^","`"].concat(delims),autoEscape=["'"].concat(unwise),nonHostChars=["%","/","?",";","#"].concat(autoEscape),hostEndingChars=["/","?","#"],hostnameMaxLen=255,hostnamePartPattern=/^[a-z0-9A-Z_-]{0,63}$/,hostnamePartStart=/^([a-z0-9A-Z_-]{0,63})(.*)$/,unsafeProtocol={javascript:!0,"javascript:":!0},hostlessProtocol={javascript:!0,"javascript:":!0},slashedProtocol={http:!0,https:!0,ftp:!0,gopher:!0,file:!0,"http:":!0,"https:":!0,"ftp:":!0,"gopher:":!0,"file:":!0},querystring=require("querystring");Url.prototype.parse=function(t,s,e){if(!isString(t))throw new TypeError("Parameter 'url' must be a string, not "+typeof t);var h=t;h=h.trim();var r=protocolPattern.exec(h);if(r){r=r[0];var o=r.toLowerCase();this.protocol=o,h=h.substr(r.length)}if(e||r||h.match(/^\/\/[^@\/]+@[^@\/]+/)){var a="//"===h.substr(0,2);!a||r&&hostlessProtocol[r]||(h=h.substr(2),this.slashes=!0)}if(!hostlessProtocol[r]&&(a||r&&!slashedProtocol[r])){for(var n=-1,i=0;i<hostEndingChars.length;i++){var l=h.indexOf(hostEndingChars[i]);-1!==l&&(-1===n||n>l)&&(n=l)}var c,u;u=-1===n?h.lastIndexOf("@"):h.lastIndexOf("@",n),-1!==u&&(c=h.slice(0,u),h=h.slice(u+1),this.auth=decodeURIComponent(c)),n=-1;for(var i=0;i<nonHostChars.length;i++){var l=h.indexOf(nonHostChars[i]);-1!==l&&(-1===n||n>l)&&(n=l)}-1===n&&(n=h.length),this.host=h.slice(0,n),h=h.slice(n),this.parseHost(),this.hostname=this.hostname||"";var p="["===this.hostname[0]&&"]"===this.hostname[this.hostname.length-1];if(!p)for(var f=this.hostname.split(/\./),i=0,m=f.length;m>i;i++){var v=f[i];if(v&&!v.match(hostnamePartPattern)){for(var g="",y=0,d=v.length;d>y;y++)g+=v.charCodeAt(y)>127?"x":v[y];if(!g.match(hostnamePartPattern)){var P=f.slice(0,i),b=f.slice(i+1),j=v.match(hostnamePartStart);j&&(P.push(j[1]),b.unshift(j[2])),b.length&&(h="/"+b.join(".")+h),this.hostname=P.join(".");break}}}if(this.hostname=this.hostname.length>hostnameMaxLen?"":this.hostname.toLowerCase(),!p){for(var O=this.hostname.split("."),q=[],i=0;i<O.length;++i){var x=O[i];q.push(x.match(/[^A-Za-z0-9_-]/)?"xn--"+punycode.encode(x):x)}this.hostname=q.join(".")}var U=this.port?":"+this.port:"",C=this.hostname||"";this.host=C+U,this.href+=this.host,p&&(this.hostname=this.hostname.substr(1,this.hostname.length-2),"/"!==h[0]&&(h="/"+h))}if(!unsafeProtocol[o])for(var i=0,m=autoEscape.length;m>i;i++){var A=autoEscape[i],E=encodeURIComponent(A);E===A&&(E=escape(A)),h=h.split(A).join(E)}var w=h.indexOf("#");-1!==w&&(this.hash=h.substr(w),h=h.slice(0,w));var R=h.indexOf("?");if(-1!==R?(this.search=h.substr(R),this.query=h.substr(R+1),s&&(this.query=querystring.parse(this.query)),h=h.slice(0,R)):s&&(this.search="",this.query={}),h&&(this.pathname=h),slashedProtocol[o]&&this.hostname&&!this.pathname&&(this.pathname="/"),this.pathname||this.search){var U=this.pathname||"",x=this.search||"";this.path=U+x}return this.href=this.format(),this},Url.prototype.format=function(){var t=this.auth||"";t&&(t=encodeURIComponent(t),t=t.replace(/%3A/i,":"),t+="@");var s=this.protocol||"",e=this.pathname||"",h=this.hash||"",r=!1,o="";this.host?r=t+this.host:this.hostname&&(r=t+(-1===this.hostname.indexOf(":")?this.hostname:"["+this.hostname+"]"),this.port&&(r+=":"+this.port)),this.query&&isObject(this.query)&&Object.keys(this.query).length&&(o=querystring.stringify(this.query));var a=this.search||o&&"?"+o||"";return s&&":"!==s.substr(-1)&&(s+=":"),this.slashes||(!s||slashedProtocol[s])&&r!==!1?(r="//"+(r||""),e&&"/"!==e.charAt(0)&&(e="/"+e)):r||(r=""),h&&"#"!==h.charAt(0)&&(h="#"+h),a&&"?"!==a.charAt(0)&&(a="?"+a),e=e.replace(/[?#]/g,function(t){return encodeURIComponent(t)}),a=a.replace("#","%23"),s+r+e+a+h},Url.prototype.resolve=function(t){return this.resolveObject(urlParse(t,!1,!0)).format()},Url.prototype.resolveObject=function(t){if(isString(t)){var s=new Url;s.parse(t,!1,!0),t=s}var e=new Url;if(Object.keys(this).forEach(function(t){e[t]=this[t]},this),e.hash=t.hash,""===t.href)return e.href=e.format(),e;if(t.slashes&&!t.protocol)return Object.keys(t).forEach(function(s){"protocol"!==s&&(e[s]=t[s])}),slashedProtocol[e.protocol]&&e.hostname&&!e.pathname&&(e.path=e.pathname="/"),e.href=e.format(),e;if(t.protocol&&t.protocol!==e.protocol){if(!slashedProtocol[t.protocol])return Object.keys(t).forEach(function(s){e[s]=t[s]}),e.href=e.format(),e;if(e.protocol=t.protocol,t.host||hostlessProtocol[t.protocol])e.pathname=t.pathname;else{for(var h=(t.pathname||"").split("/");h.length&&!(t.host=h.shift()););t.host||(t.host=""),t.hostname||(t.hostname=""),""!==h[0]&&h.unshift(""),h.length<2&&h.unshift(""),e.pathname=h.join("/")}if(e.search=t.search,e.query=t.query,e.host=t.host||"",e.auth=t.auth,e.hostname=t.hostname||t.host,e.port=t.port,e.pathname||e.search){var r=e.pathname||"",o=e.search||"";e.path=r+o}return e.slashes=e.slashes||t.slashes,e.href=e.format(),e}var a=e.pathname&&"/"===e.pathname.charAt(0),n=t.host||t.pathname&&"/"===t.pathname.charAt(0),i=n||a||e.host&&t.pathname,l=i,c=e.pathname&&e.pathname.split("/")||[],h=t.pathname&&t.pathname.split("/")||[],u=e.protocol&&!slashedProtocol[e.protocol];if(u&&(e.hostname="",e.port=null,e.host&&(""===c[0]?c[0]=e.host:c.unshift(e.host)),e.host="",t.protocol&&(t.hostname=null,t.port=null,t.host&&(""===h[0]?h[0]=t.host:h.unshift(t.host)),t.host=null),i=i&&(""===h[0]||""===c[0])),n)e.host=t.host||""===t.host?t.host:e.host,e.hostname=t.hostname||""===t.hostname?t.hostname:e.hostname,e.search=t.search,e.query=t.query,c=h;else if(h.length)c||(c=[]),c.pop(),c=c.concat(h),e.search=t.search,e.query=t.query;else if(!isNullOrUndefined(t.search)){if(u){e.hostname=e.host=c.shift();var p=e.host&&e.host.indexOf("@")>0?e.host.split("@"):!1;p&&(e.auth=p.shift(),e.host=e.hostname=p.shift())}return e.search=t.search,e.query=t.query,isNull(e.pathname)&&isNull(e.search)||(e.path=(e.pathname?e.pathname:"")+(e.search?e.search:"")),e.href=e.format(),e}if(!c.length)return e.pathname=null,e.path=e.search?"/"+e.search:null,e.href=e.format(),e;for(var f=c.slice(-1)[0],m=(e.host||t.host)&&("."===f||".."===f)||""===f,v=0,g=c.length;g>=0;g--)f=c[g],"."==f?c.splice(g,1):".."===f?(c.splice(g,1),v++):v&&(c.splice(g,1),v--);if(!i&&!l)for(;v--;v)c.unshift("..");!i||""===c[0]||c[0]&&"/"===c[0].charAt(0)||c.unshift(""),m&&"/"!==c.join("/").substr(-1)&&c.push("");var y=""===c[0]||c[0]&&"/"===c[0].charAt(0);if(u){e.hostname=e.host=y?"":c.length?c.shift():"";var p=e.host&&e.host.indexOf("@")>0?e.host.split("@"):!1;p&&(e.auth=p.shift(),e.host=e.hostname=p.shift())}return i=i||e.host&&c.length,i&&!y&&c.unshift(""),c.length?e.pathname=c.join("/"):(e.pathname=null,e.path=null),isNull(e.pathname)&&isNull(e.search)||(e.path=(e.pathname?e.pathname:"")+(e.search?e.search:"")),e.auth=t.auth||e.auth,e.slashes=e.slashes||t.slashes,e.href=e.format(),e},Url.prototype.parseHost=function(){var t=this.host,s=portPattern.exec(t);s&&(s=s[0],":"!==s&&(this.port=s.substr(1)),t=t.substr(0,t.length-s.length)),t&&(this.hostname=t)};


},{"punycode":6,"querystring":9}],11:[function(require,module,exports){
"use strict";var _=require("lodash"),request=require("superagent"),traverse=require("traverse"),remoteCache={},getRemoteJson=function(e,r){var t,n=e.split("#")[0],i=remoteCache[n];_.isUndefined(i)?request.get(e).set("user-agent","whitlockjc/json-refs").set("Accept","application/json").end(function(e){if(_.isPlainObject(e.body))i=e.body;else try{i=JSON.parse(e.text)}catch(o){t=o}remoteCache[n]=i,r(t,i)}):r(t,i)},isJsonReference=module.exports.isJsonReference=function(e){return _.isPlainObject(e)&&_.isString(e.$ref)},pathToPointer=module.exports.pathToPointer=function(e){if(_.isUndefined(e))throw new Error("path is required");if(!_.isArray(e))throw new Error("path must be an array");var r="#";return e.length>0&&(r+="/"+_.map(e,function(e){return e.replace(/~/g,"~0").replace(/\//g,"~1")}).join("/")),r},findRefs=module.exports.findRefs=function(e){if(_.isUndefined(e))throw new Error("json is required");if(!_.isPlainObject(e))throw new Error("json must be an object");return traverse(e).reduce(function(e){var r=this.node;return"$ref"===this.key&&isJsonReference(this.parent.node)&&(e[pathToPointer(this.path)]=r),e},{})},isRemotePointer=module.exports.isRemotePointer=function(e){if(_.isUndefined(e))throw new Error("ptr is required");if(!_.isString(e))throw new Error("ptr must be a string");return/^https?:\/\//.test(e)},pathFromPointer=module.exports.pathFromPointer=function(e){if(_.isUndefined(e))throw new Error("ptr is required");if(!_.isString(e))throw new Error("ptr must be a string");var r=[];return isRemotePointer(e)?r=e:"#"===e.charAt(0)&&"#"!==e&&(r=_.map(e.substring(1).split("/"),function(e){return e.replace(/~0/g,"~").replace(/~1/g,"/")}),r.length>1&&r.shift()),r},resolveRefs=module.exports.resolveRefs=function e(r,t){if(_.isUndefined(r))throw new Error("json is required");if(!_.isPlainObject(r))throw new Error("json must be an object");if(_.isUndefined(t))throw new Error("done is required");if(!_.isFunction(t))throw new Error("done must be a function");var n,i=!1,o=findRefs(r),s=function(e){return e.map(function(){this.circular&&this.update(traverse(this.node).map(function(){this.circular&&this.parent.remove()}))})};Object.keys(o).length>0?(n=traverse(_.cloneDeep(r)),_.each(o,function(o,a){var u=pathFromPointer(a),f=u.slice(0,u.length-1);isRemotePointer(o)?(i=!0,getRemoteJson(o,function(r,i){r?t(r):e(i,function(e,r){e?t(e):(0===f.length?n.value=r:n.set(f,traverse(r).get(pathFromPointer(-1===o.indexOf("#")?"#":o.substring(o.indexOf("#"))))),t(void 0,s(n)))})})):0===f.length?n.value=r:n.set(f,n.get(pathFromPointer(o)))}),i||t(void 0,s(n))):t(void 0,r)};


},{"lodash":12,"superagent":14,"traverse":64}],12:[function(require,module,exports){
(function (global){
(function(){function n(n,t){if(n!==t){var r=n===n,e=t===t;if(n>t||!r||"undefined"==typeof n&&e)return 1;if(t>n||!e||"undefined"==typeof t&&r)return-1}return 0}function t(n,t,r){if(t!==t)return p(n,r);for(var e=(r||0)-1,u=n.length;++e<u;)if(n[e]===t)return e;return-1}function r(n,t){var r=n.length;for(n.sort(t);r--;)n[r]=n[r].value;return n}function e(n){return"string"==typeof n?n:null==n?"":n+""}function u(n){return n.charCodeAt(0)}function i(n,t){for(var r=-1,e=n.length;++r<e&&t.indexOf(n.charAt(r))>-1;);return r}function o(n,t){for(var r=n.length;r--&&t.indexOf(n.charAt(r))>-1;);return r}function a(t,r){return n(t.criteria,r.criteria)||t.index-r.index}function f(t,r){for(var e=-1,u=t.criteria,i=r.criteria,o=u.length;++e<o;){var a=n(u[e],i[e]);if(a)return a}return t.index-r.index}function c(n){return $t[n]}function l(n){return Bt[n]}function s(n){return"\\"+Mt[n]}function p(n,t,r){for(var e=n.length,u=r?t||e:(t||0)-1;r?u--:++u<e;){var i=n[u];if(i!==i)return u}return-1}function h(n){return n&&"object"==typeof n||!1}function v(n){return 160>=n&&n>=9&&13>=n||32==n||160==n||5760==n||6158==n||n>=8192&&(8202>=n||8232==n||8233==n||8239==n||8287==n||12288==n||65279==n)}function g(n,t){for(var r=-1,e=n.length,u=-1,i=[];++r<e;)n[r]===t&&(n[r]=D,i[++u]=r);return i}function d(n,t){for(var r,e=-1,u=n.length,i=-1,o=[];++e<u;){var a=n[e],f=t?t(a,e,n):a;e&&r===f||(r=f,o[++i]=a)}return o}function y(n){for(var t=-1,r=n.length;++t<r&&v(n.charCodeAt(t)););return t}function _(n){for(var t=n.length;t--&&v(n.charCodeAt(t)););return t}function m(n){return Dt[n]}function w(v){function Y(n){if(h(n)&&!za(n)){if(n instanceof Z)return n;if(Ko.call(n,"__wrapped__"))return new Z(n.__wrapped__,n.__chain__,Zt(n.__actions__))}return new Z(n)}function Z(n,t,r){this.__actions__=r||[],this.__chain__=!!t,this.__wrapped__=n}function Q(n){this.actions=null,this.dir=1,this.dropCount=0,this.filtered=!1,this.iteratees=null,this.takeCount=ba,this.views=null,this.wrapped=n}function $t(){var n=this.actions,t=this.iteratees,r=this.views,e=new Q(this.wrapped);return e.actions=n?Zt(n):null,e.dir=this.dir,e.dropCount=this.dropCount,e.filtered=this.filtered,e.iteratees=t?Zt(t):null,e.takeCount=this.takeCount,e.views=r?Zt(r):null,e}function Bt(){if(this.filtered){var n=new Q(this);n.dir=-1,n.filtered=!0}else n=this.clone(),n.dir*=-1;return n}function Dt(){var n=this.wrapped.value();if(!za(n))return Vr(n,this.actions);var t=this.dir,r=0>t,e=ge(0,n.length,this.views),u=e.start,i=e.end,o=i-u,a=this.dropCount,f=ga(o,this.takeCount-a),c=r?i:u-1,l=this.iteratees,s=l?l.length:0,p=0,h=[];n:for(;o--&&f>p;){c+=t;for(var v=-1,g=n[c];++v<s;){var d=l[v],y=d.iteratee,_=y(g,c,n),m=d.type;if(m==L)g=_;else if(!_){if(m==U)continue n;break n}}a?a--:h[p++]=g}return h}function zt(){this.__data__={}}function Mt(n){return this.has(n)&&delete this.__data__[n]}function Pt(n){return"__proto__"==n?b:this.__data__[n]}function Kt(n){return"__proto__"!=n&&Ko.call(this.__data__,n)}function Vt(n,t){return"__proto__"!=n&&(this.__data__[n]=t),this}function Yt(n){var t=n?n.length:0;for(this.data={hash:sa(null),set:new ua};t--;)this.push(n[t])}function Jt(n,t){var r=n.data,e="string"==typeof t||mi(t)?r.set.has(t):r.hash[t];return e?0:-1}function Xt(n){var t=this.data;"string"==typeof n||mi(n)?t.set.add(n):t.hash[n]=!0}function Zt(n,t){var r=-1,e=n.length;for(t||(t=Co(e));++r<e;)t[r]=n[r];return t}function Ht(n,t){for(var r=-1,e=n.length;++r<e&&t(n[r],r,n)!==!1;);return n}function Qt(n,t){for(var r=n.length;r--&&t(n[r],r,n)!==!1;);return n}function nr(n,t){for(var r=-1,e=n.length;++r<e;)if(!t(n[r],r,n))return!1;return!0}function tr(n,t){for(var r=-1,e=n.length,u=-1,i=[];++r<e;){var o=n[r];t(o,r,n)&&(i[++u]=o)}return i}function rr(n,t){for(var r=-1,e=n.length,u=Co(e);++r<e;)u[r]=t(n[r],r,n);return u}function er(n){for(var t=-1,r=n.length,e=wa;++t<r;){var u=n[t];u>e&&(e=u)}return e}function ur(n){for(var t=-1,r=n.length,e=ba;++t<r;){var u=n[t];e>u&&(e=u)}return e}function ir(n,t,r,e){var u=-1,i=n.length;for(e&&i&&(r=n[++u]);++u<i;)r=t(r,n[u],u,n);return r}function or(n,t,r,e){var u=n.length;for(e&&u&&(r=n[--u]);u--;)r=t(r,n[u],u,n);return r}function ar(n,t){for(var r=-1,e=n.length;++r<e;)if(t(n[r],r,n))return!0;return!1}function fr(n,t){return"undefined"==typeof n?t:n}function cr(n,t,r,e){return"undefined"!=typeof n&&Ko.call(e,r)?n:t}function lr(n,t,r){var e=Ka(t);if(!r)return pr(t,n,e);for(var u=-1,i=e.length;++u<i;){var o=e[u],a=n[o],f=r(a,t[o],o,n,t);(f===f?f===a:a!==a)&&("undefined"!=typeof a||o in n)||(n[o]=f)}return n}function sr(n,t){for(var r=-1,e=n.length,u=xe(e),i=t.length,o=Co(i);++r<i;){var a=t[r];u?(a=parseFloat(a),o[r]=we(a,e)?n[a]:b):o[r]=n[a]}return o}function pr(n,t,r){r||(r=t,t={});for(var e=-1,u=r.length;++e<u;){var i=r[e];t[i]=n[i]}return t}function hr(n,t){for(var r=-1,e=t.length;++r<e;){var u=t[r];n[u]=fe(n[u],A,n)}return n}function vr(n,t,r){var e=typeof n;return"function"==e?"undefined"!=typeof t&&me(n)?Jr(n,t,r):n:null==n?wo:"object"==e?Fr(n,!r):$r(n+"")}function gr(n,t,r,e,u,i,o){var a;if(r&&(a=u?r(n,e,u):r(n)),"undefined"!=typeof a)return a;if(!mi(n))return n;var f=za(n);if(f){if(a=de(n),!t)return Zt(n,a)}else{var c=Yo.call(n),l=c==V;if(c!=J&&c!=z&&(!l||u))return Ut[c]?_e(n,c,t):u?n:{};if(a=ye(l?{}:n),!t)return pr(n,a,Ka(n))}i||(i=[]),o||(o=[]);for(var s=i.length;s--;)if(i[s]==n)return o[s];return i.push(n),o.push(a),(f?Ht:Ir)(n,function(e,u){a[u]=gr(e,t,r,u,n,i,o)}),a}function dr(n,t,r,e){if(!_i(n))throw new Bo(B);return ia(function(){n.apply(b,Mr(r,e))},t)}function yr(n,r){var e=n?n.length:0,u=[];if(!e)return u;var i=-1,o=ve(),a=o==t,f=a&&r.length>=200&&Ta(r),c=r.length;f&&(o=Jt,a=!1,r=f);n:for(;++i<e;){var l=n[i];if(a&&l===l){for(var s=c;s--;)if(r[s]===l)continue n;u.push(l)}else o(r,l)<0&&u.push(l)}return u}function _r(n,t){var r=n?n.length:0;if(!xe(r))return Ir(n,t);for(var e=-1,u=Te(n);++e<r&&t(u[e],e,u)!==!1;);return n}function mr(n,t){var r=n?n.length:0;if(!xe(r))return kr(n,t);for(var e=Te(n);r--&&t(e[r],r,e)!==!1;);return n}function wr(n,t){var r=!0;return _r(n,function(n,e,u){return r=!!t(n,e,u)}),r}function br(n,t){var r=[];return _r(n,function(n,e,u){t(n,e,u)&&r.push(n)}),r}function xr(n,t,r,e){var u;return r(n,function(n,r,i){return t(n,r,i)?(u=e?r:n,!1):void 0}),u}function Ar(n,t,r,e){for(var u=(e||0)-1,i=n.length,o=-1,a=[];++u<i;){var f=n[u];if(h(f)&&xe(f.length)&&(za(f)||si(f))){t&&(f=Ar(f,t,r));var c=-1,l=f.length;for(a.length+=l;++c<l;)a[++o]=f[c]}else r||(a[++o]=f)}return a}function jr(n,t,r){for(var e=-1,u=Te(n),i=r(n),o=i.length;++e<o;){var a=i[e];if(t(u[a],a,u)===!1)break}return n}function Er(n,t,r){for(var e=Te(n),u=r(n),i=u.length;i--;){var o=u[i];if(t(e[o],o,e)===!1)break}return n}function Rr(n,t){return jr(n,t,Mi)}function Ir(n,t){return jr(n,t,Ka)}function kr(n,t){return Er(n,t,Ka)}function Or(n,t){for(var r=-1,e=t.length,u=-1,i=[];++r<e;){var o=t[r];_i(n[o])&&(i[++u]=o)}return i}function Cr(n,t,r){var e=-1,u="function"==typeof t,i=n?n.length:0,o=xe(i)?Co(i):[];return _r(n,function(n){var i=u?t:null!=n&&n[t];o[++e]=i?i.apply(n,r):b}),o}function Tr(n,t,r,e,u,i){if(n===t)return 0!==n||1/n==1/t;var o=typeof n,a=typeof t;return"function"!=o&&"object"!=o&&"function"!=a&&"object"!=a||null==n||null==t?n!==n&&t!==t:Sr(n,t,Tr,r,e,u,i)}function Sr(n,t,r,e,u,i,o){var a=za(n),f=za(t),c=M,l=M;a||(c=Yo.call(n),c==z?c=J:c!=J&&(a=Ii(n))),f||(l=Yo.call(t),l==z?l=J:l!=J&&(f=Ii(t)));var s=c==J,p=l==J,h=c==l;if(h&&!a&&!s)return le(n,t,c);var v=s&&Ko.call(n,"__wrapped__"),g=p&&Ko.call(t,"__wrapped__");if(v||g)return r(v?n.value():n,g?t.value():t,e,u,i,o);if(!h)return!1;i||(i=[]),o||(o=[]);for(var d=i.length;d--;)if(i[d]==n)return o[d]==t;i.push(n),o.push(t);var y=(a?ce:se)(n,t,r,e,u,i,o);return i.pop(),o.pop(),y}function Nr(n,t,r,e,u){var i=t.length;if(null==n)return!i;for(var o=-1,a=!u;++o<i;)if(a&&e[o]?r[o]!==n[t[o]]:!Ko.call(n,t[o]))return!1;for(o=-1;++o<i;){var f=t[o];if(a&&e[o])var c=Ko.call(n,f);else{var l=n[f],s=r[o];c=u?u(l,s,f):b,"undefined"==typeof c&&(c=Tr(s,l,u,!0))}if(!c)return!1}return!0}function Wr(n,t){var r=[];return _r(n,function(n,e,u){r.push(t(n,e,u))}),r}function Fr(n,t){var r=Ka(n),e=r.length;if(1==e){var u=r[0],i=n[u];if(Ae(i))return function(n){return null!=n&&i===n[u]&&Ko.call(n,u)}}t&&(n=gr(n,!0));for(var o=Co(e),a=Co(e);e--;)i=n[r[e]],o[e]=i,a[e]=Ae(i);return function(n){return Nr(n,r,o,a)}}function Ur(n,t,r,e,u){var i=xe(t.length)&&(za(t)||Ii(t));return(i?Ht:Ir)(t,function(t,o,a){if(h(t))return e||(e=[]),u||(u=[]),Lr(n,a,o,Ur,r,e,u);var f=n[o],c=r?r(f,t,o,n,a):b,l="undefined"==typeof c;l&&(c=t),!i&&"undefined"==typeof c||!l&&(c===c?c===f:f!==f)||(n[o]=c)}),n}function Lr(n,t,r,e,u,i,o){for(var a=i.length,f=t[r];a--;)if(i[a]==f)return void(n[r]=o[a]);var c=n[r],l=u?u(c,f,r,n,t):b,s="undefined"==typeof l;s&&(l=f,xe(f.length)&&(za(f)||Ii(f))?l=za(c)?c:c?Zt(c):[]:qa(f)||si(f)?l=si(c)?Ci(c):qa(c)?c:{}:s=!1),i.push(f),o.push(l),s?n[r]=e(l,f,u,i,o):(l===l?l!==c:c===c)&&(n[r]=l)}function $r(n){return function(t){return null==t?b:t[n]}}function Br(t,r){var e=r.length,u=sr(t,r);for(r.sort(n);e--;){var i=parseFloat(r[e]);if(i!=o&&we(i)){var o=i;oa.call(t,i,1)}}return u}function Dr(n,t){return n+na(ma()*(t-n+1))}function zr(n,t,r,e,u){return u(n,function(n,u,i){r=e?(e=!1,n):t(r,n,u,i)}),r}function Mr(n,t,r){var e=-1,u=n.length;t=null==t?0:+t||0,0>t&&(t=-t>u?0:u+t),r="undefined"==typeof r||r>u?u:+r||0,0>r&&(r+=u),u=t>r?0:r-t>>>0,t>>>=0;for(var i=Co(u);++e<u;)i[e]=n[e+t];return i}function qr(n,t){var r;return _r(n,function(n,e,u){return r=t(n,e,u),!r}),!!r}function Pr(n,r){var e=-1,u=ve(),i=n.length,o=u==t,a=o&&i>=200,f=a&&Ta(),c=[];f?(u=Jt,o=!1):(a=!1,f=r?[]:c);n:for(;++e<i;){var l=n[e],s=r?r(l,e,n):l;if(o&&l===l){for(var p=f.length;p--;)if(f[p]===s)continue n;r&&f.push(s),c.push(l)}else u(f,s)<0&&((r||a)&&f.push(s),c.push(l))}return c}function Kr(n,t){for(var r=-1,e=t.length,u=Co(e);++r<e;)u[r]=n[t[r]];return u}function Vr(n,t){var r=n;r instanceof Q&&(r=r.value());for(var e=-1,u=t.length;++e<u;){var i=[r],o=t[e];ra.apply(i,o.args),r=o.func.apply(o.thisArg,i)}return r}function Yr(n,t,r){var e=0,u=n?n.length:e;if("number"==typeof t&&t===t&&ja>=u){for(;u>e;){var i=e+u>>>1,o=n[i];(r?t>=o:t>o)?e=i+1:u=i}return u}return Gr(n,t,wo,r)}function Gr(n,t,r,e){t=r(t);for(var u=0,i=n?n.length:0,o=t!==t,a="undefined"==typeof t;i>u;){var f=na((u+i)/2),c=r(n[f]),l=c===c;if(o)var s=l||e;else s=a?l&&(e||"undefined"!=typeof c):e?t>=c:t>c;s?u=f+1:i=f}return ga(i,Aa)}function Jr(n,t,r){if("function"!=typeof n)return wo;if("undefined"==typeof t)return n;switch(r){case 1:return function(r){return n.call(t,r)};case 3:return function(r,e,u){return n.call(t,r,e,u)};case 4:return function(r,e,u,i){return n.call(t,r,e,u,i)};case 5:return function(r,e,u,i,o){return n.call(t,r,e,u,i,o)}}return function(){return n.apply(t,arguments)}}function Xr(n){return Zo.call(n,0)}function Zr(n,t,r){for(var e=r.length,u=-1,i=va(n.length-e,0),o=-1,a=t.length,f=Co(i+a);++o<a;)f[o]=t[o];for(;++u<e;)f[r[u]]=n[u];for(;i--;)f[o++]=n[u++];return f}function Hr(n,t,r){for(var e=-1,u=r.length,i=-1,o=va(n.length-u,0),a=-1,f=t.length,c=Co(o+f);++i<o;)c[i]=n[i];for(var l=i;++a<f;)c[l+a]=t[a];for(;++e<u;)c[l+r[e]]=n[i++];return c}function Qr(n,t){return function(r,e,u){var i=t?t():{};if(e=he(e,u,3),za(r))for(var o=-1,a=r.length;++o<a;){var f=r[o];n(i,f,e(f,o,r),r)}else _r(r,function(t,r,u){n(i,t,e(t,r,u),u)});return i}}function ne(n){return function(){var t=arguments.length,r=arguments[0];if(2>t||null==r)return r;if(t>3&&be(arguments[1],arguments[2],arguments[3])&&(t=2),t>3&&"function"==typeof arguments[t-2])var e=Jr(arguments[--t-1],arguments[t--],5);else t>2&&"function"==typeof arguments[t-1]&&(e=arguments[--t]);for(var u=0;++u<t;){var i=arguments[u];i&&n(r,i,e)}return r}}function te(n,t){function r(){return(this instanceof r?e:n).apply(t,arguments)}var e=ee(n);return r}function re(n){return function(t){for(var r=-1,e=go(Qi(t)),u=e.length,i="";++r<u;)i=n(i,e[r],r);return i}}function ee(n){return function(){var t=Oa(n.prototype),r=n.apply(t,arguments);return mi(r)?r:t}}function ue(n,t){return function(r,e,i){i&&be(r,e,i)&&(e=null);var o=he(),a=null==e;if(o===vr&&a||(a=!1,e=o(e,i,3)),a){var f=za(r);if(f||!Ri(r))return n(f?r:Ce(r));e=u}return pe(r,e,t)}}function ie(n,t,r,e,u,i,o,a,f,c){function l(){for(var w=arguments.length,b=w,x=Co(w);b--;)x[b]=arguments[b];if(e&&(x=Zr(x,e,u)),i&&(x=Hr(x,i,o)),v||y){var E=l.placeholder,R=g(x,E);if(w-=R.length,c>w){var I=a?Zt(a):null,C=va(c-w,0),T=v?R:null,S=v?null:R,N=v?x:null,W=v?null:x;t|=v?k:O,t&=~(v?O:k),d||(t&=~(A|j));var F=ie(n,t,r,N,T,W,S,I,f,C);return F.placeholder=E,F}}var U=p?r:this;return h&&(n=U[m]),a&&(x=Ie(x,a)),s&&f<x.length&&(x.length=f),(this instanceof l?_||ee(n):n).apply(U,x)}var s=t&T,p=t&A,h=t&j,v=t&R,d=t&E,y=t&I,_=!h&&ee(n),m=n;return l}function oe(n,t,r){var e=n.length;if(t=+t,e>=t||!pa(t))return"";var u=t-e;return r=null==r?" ":r+"",ao(r,Ho(u/r.length)).slice(0,u)}function ae(n,t,r,e){function u(){for(var t=-1,a=arguments.length,f=-1,c=e.length,l=Co(a+c);++f<c;)l[f]=e[f];for(;a--;)l[f++]=arguments[++t];return(this instanceof u?o:n).apply(i?r:this,l)}var i=t&A,o=ee(n);return u}function fe(n,t,r,e,u,i,o,a){var f=t&j;if(!f&&!_i(n))throw new Bo(B);var c=e?e.length:0;if(c||(t&=~(k|O),e=u=null),c-=u?u.length:0,t&O){var l=e,s=u;e=u=null}var p=!f&&Sa(n),h=[n,t,r,e,u,l,s,i,o,a];if(p&&p!==!0&&(je(h,p),t=h[1],a=h[9]),h[9]=null==a?f?0:n.length:va(a-c,0)||0,t==A)var v=te(h[0],h[2]);else v=t!=k&&t!=(A|k)||h[4].length?ie.apply(null,h):ae.apply(null,h);var g=p?Ca:Na;return g(v,h)}function ce(n,t,r,e,u,i,o){var a=-1,f=n.length,c=t.length,l=!0;if(f!=c&&!(u&&c>f))return!1;for(;l&&++a<f;){var s=n[a],p=t[a];if(l=b,e&&(l=u?e(p,s,a):e(s,p,a)),"undefined"==typeof l)if(u)for(var h=c;h--&&(p=t[h],!(l=s&&s===p||r(s,p,e,u,i,o))););else l=s&&s===p||r(s,p,e,u,i,o)}return!!l}function le(n,t,r){switch(r){case q:case P:return+n==+t;case K:return n.name==t.name&&n.message==t.message;case G:return n!=+n?t!=+t:0==n?1/n==1/t:n==+t;case X:case H:return n==t+""}return!1}function se(n,t,r,e,u,i,o){var a=Ka(n),f=a.length,c=Ka(t),l=c.length;if(f!=l&&!u)return!1;for(var s,p=-1;++p<f;){var h=a[p],v=Ko.call(t,h);if(v){var g=n[h],d=t[h];v=b,e&&(v=u?e(d,g,h):e(g,d,h)),"undefined"==typeof v&&(v=g&&g===d||r(g,d,e,u,i,o))}if(!v)return!1;s||(s="constructor"==h)}if(!s){var y=n.constructor,_=t.constructor;if(y!=_&&"constructor"in n&&"constructor"in t&&!("function"==typeof y&&y instanceof y&&"function"==typeof _&&_ instanceof _))return!1}return!0}function pe(n,t,r){var e=r?ba:wa,u=e,i=u;return _r(n,function(n,o,a){var f=t(n,o,a);((r?u>f:f>u)||f===e&&f===i)&&(u=f,i=n)}),i}function he(n,t,r){var e=Y.callback||_o;return e=e===_o?vr:e,r?e(n,t,r):e}function ve(n,r,e){var u=Y.indexOf||Pe;return u=u===Pe?t:u,n?u(n,r,e):u}function ge(n,t,r){for(var e=-1,u=r?r.length:0;++e<u;){var i=r[e],o=i.size;switch(i.type){case"drop":n+=o;break;case"dropRight":t-=o;break;case"take":t=ga(t,n+o);break;case"takeRight":n=va(n,t-o)}}return{start:n,end:t}}function de(n){var t=n.length,r=new n.constructor(t);return t&&"string"==typeof n[0]&&Ko.call(n,"index")&&(r.index=n.index,r.input=n.input),r}function ye(n){var t=n.constructor;return"function"==typeof t&&t instanceof t||(t=Uo),new t}function _e(n,t,r){var e=n.constructor;switch(t){case nt:return Xr(n);case q:case P:return new e(+n);case tt:case rt:case et:case ut:case it:case ot:case at:case ft:case ct:var u=n.buffer;return new e(r?Xr(u):u,n.byteOffset,n.length);case G:case H:return new e(n);case X:var i=new e(n.source,bt.exec(n));i.lastIndex=n.lastIndex}return i}function me(n){var t=Y.support,r=!(t.funcNames?n.name:t.funcDecomp);if(!r){var e=qo.call(n);t.funcNames||(r=!xt.test(e)),r||(r=Ot.test(e)||xi(n),Ca(n,r))}return r}function we(n,t){return n=+n,t=null==t?Ra:t,n>-1&&n%1==0&&t>n}function be(n,t,r){if(!mi(r))return!1;var e=typeof t;if("number"==e)var u=r.length,i=xe(u)&&we(t,u);else i="string"==e&&t in n;return i&&r[t]===n}function xe(n){return"number"==typeof n&&n>-1&&n%1==0&&Ra>=n}function Ae(n){return n===n&&(0===n?1/n>0:!mi(n))}function je(n,t){var r=n[1],e=t[1],u=r|e,i=T|C,o=A|j,a=i|o|E|I,f=r&T&&!(e&T),c=r&C&&!(e&C),l=(c?n:t)[7],s=(f?n:t)[8],p=!(r>=C&&e>o||r>o&&e>=C),h=u>=i&&a>=u&&(C>r||(c||f)&&l.length<=s);if(!p&&!h)return n;e&A&&(n[2]=t[2],u|=r&A?0:E);var v=t[3];if(v){var d=n[3];n[3]=d?Zr(d,v,t[4]):Zt(v),n[4]=d?g(n[3],D):Zt(t[4])}return v=t[5],v&&(d=n[5],n[5]=d?Hr(d,v,t[6]):Zt(v),n[6]=d?g(n[5],D):Zt(t[6])),v=t[7],v&&(n[7]=Zt(v)),e&T&&(n[8]=null==n[8]?t[8]:ga(n[8],t[8])),null==n[9]&&(n[9]=t[9]),n[0]=t[0],n[1]=u,n}function Ee(n,t){n=Te(n);for(var r=-1,e=t.length,u={};++r<e;){var i=t[r];i in n&&(u[i]=n[i])}return u}function Re(n,t){var r={};return Rr(n,function(n,e,u){t(n,e,u)&&(r[e]=n)}),r}function Ie(n,t){for(var r=n.length,e=ga(t.length,r),u=Zt(n);e--;){var i=t[e];n[e]=we(i,r)?u[i]:b}return n}function ke(n){{var t;Y.support}if(!h(n)||Yo.call(n)!=J||!Ko.call(n,"constructor")&&(t=n.constructor,"function"==typeof t&&!(t instanceof t)))return!1;var r;return Rr(n,function(n,t){r=t}),"undefined"==typeof r||Ko.call(n,r)}function Oe(n){for(var t=Mi(n),r=t.length,e=r&&n.length,u=Y.support,i=e&&xe(e)&&(za(n)||u.nonEnumArgs&&si(n)),o=-1,a=[];++o<r;){var f=t[o];(i&&we(f,e)||Ko.call(n,f))&&a.push(f)}return a}function Ce(n){return null==n?[]:xe(n.length)?mi(n)?n:Uo(n):Ji(n)}function Te(n){return mi(n)?n:Uo(n)}function Se(n,t,r){t=(r?be(n,t,r):null==t)?1:va(+t||1,1);for(var e=0,u=n?n.length:0,i=-1,o=Co(Ho(u/t));u>e;)o[++i]=Mr(n,e,e+=t);return o}function Ne(n){for(var t=-1,r=n?n.length:0,e=-1,u=[];++t<r;){var i=n[t];i&&(u[++e]=i)}return u}function We(){for(var n=-1,t=arguments.length;++n<t;){var r=arguments[n];if(za(r)||si(r))break}return yr(r,Ar(arguments,!1,!0,++n))}function Fe(n,t,r){var e=n?n.length:0;return e?((r?be(n,t,r):null==t)&&(t=1),Mr(n,0>t?0:t)):[]}function Ue(n,t,r){var e=n?n.length:0;return e?((r?be(n,t,r):null==t)&&(t=1),t=e-(+t||0),Mr(n,0,0>t?0:t)):[]}function Le(n,t,r){var e=n?n.length:0;if(!e)return[];for(t=he(t,r,3);e--&&t(n[e],e,n););return Mr(n,0,e+1)}function $e(n,t,r){var e=n?n.length:0;if(!e)return[];var u=-1;for(t=he(t,r,3);++u<e&&t(n[u],u,n););return Mr(n,u)}function Be(n,t,r){var e=-1,u=n?n.length:0;for(t=he(t,r,3);++e<u;)if(t(n[e],e,n))return e;return-1}function De(n,t,r){var e=n?n.length:0;for(t=he(t,r,3);e--;)if(t(n[e],e,n))return e;return-1}function ze(n){return n?n[0]:b}function Me(n,t,r){var e=n?n.length:0;return r&&be(n,t,r)&&(t=!1),e?Ar(n,t):[]}function qe(n){var t=n?n.length:0;return t?Ar(n,!0):[]}function Pe(n,r,e){var u=n?n.length:0;if(!u)return-1;if("number"==typeof e)e=0>e?va(u+e,0):e||0;else if(e){var i=Yr(n,r),o=n[i];return(r===r?r===o:o!==o)?i:-1}return t(n,r,e)}function Ke(n){return Ue(n,1)}function Ve(){for(var n=[],r=-1,e=arguments.length,u=[],i=ve(),o=i==t;++r<e;){var a=arguments[r];(za(a)||si(a))&&(n.push(a),u.push(o&&a.length>=120&&Ta(r&&a)))}e=n.length;var f=n[0],c=-1,l=f?f.length:0,s=[],p=u[0];n:for(;++c<l;)if(a=f[c],(p?Jt(p,a):i(s,a))<0){for(r=e;--r;){var h=u[r];if((h?Jt(h,a):i(n[r],a))<0)continue n}p&&p.push(a),s.push(a)}return s}function Ye(n){var t=n?n.length:0;return t?n[t-1]:b}function Ge(n,t,r){var e=n?n.length:0;if(!e)return-1;var u=e;if("number"==typeof r)u=(0>r?va(e+r,0):ga(r||0,e-1))+1;else if(r){u=Yr(n,t,!0)-1;var i=n[u];return(t===t?t===i:i!==i)?u:-1}if(t!==t)return p(n,u,!0);for(;u--;)if(n[u]===t)return u;return-1}function Je(){var n=arguments[0];if(!n||!n.length)return n;for(var t=0,r=ve(),e=arguments.length;++t<e;)for(var u=0,i=arguments[t];(u=r(n,i,u))>-1;)oa.call(n,u,1);return n}function Xe(n){return Br(n||[],Ar(arguments,!1,!1,1))}function Ze(n,t,r){var e=-1,u=n?n.length:0,i=[];for(t=he(t,r,3);++e<u;){var o=n[e];t(o,e,n)&&(i.push(o),oa.call(n,e--,1),u--)}return i}function He(n){return Fe(n,1)}function Qe(n,t,r){var e=n?n.length:0;return e?(r&&"number"!=typeof r&&be(n,t,r)&&(t=0,r=e),Mr(n,t,r)):[]}function nu(n,t,r,e){var u=he(r);return u===vr&&null==r?Yr(n,t):Gr(n,t,u(r,e,1))}function tu(n,t,r,e){var u=he(r);return u===vr&&null==r?Yr(n,t,!0):Gr(n,t,u(r,e,1),!0)}function ru(n,t,r){var e=n?n.length:0;return e?((r?be(n,t,r):null==t)&&(t=1),Mr(n,0,0>t?0:t)):[]}function eu(n,t,r){var e=n?n.length:0;return e?((r?be(n,t,r):null==t)&&(t=1),t=e-(+t||0),Mr(n,0>t?0:t)):[]}function uu(n,t,r){var e=n?n.length:0;if(!e)return[];for(t=he(t,r,3);e--&&t(n[e],e,n););return Mr(n,e+1)}function iu(n,t,r){var e=n?n.length:0;if(!e)return[];var u=-1;for(t=he(t,r,3);++u<e&&t(n[u],u,n););return Mr(n,0,u)}function ou(){return Pr(Ar(arguments,!1,!0))}function au(n,r,e,u){var i=n?n.length:0;if(!i)return[];"boolean"!=typeof r&&null!=r&&(u=e,e=be(n,r,u)?null:r,r=!1);var o=he();return(o!==vr||null!=e)&&(e=o(e,u,3)),r&&ve()==t?d(n,e):Pr(n,e)}function fu(n){for(var t=-1,r=(n&&n.length&&er(rr(n,Po)))>>>0,e=Co(r);++t<r;)e[t]=rr(n,$r(t));return e}function cu(n){return yr(n,Mr(arguments,1))}function lu(){for(var n=-1,t=arguments.length;++n<t;){var r=arguments[n];if(za(r)||si(r))var e=e?yr(e,r).concat(yr(r,e)):r}return e?Pr(e):[]}function su(){for(var n=arguments.length,t=Co(n);n--;)t[n]=arguments[n];return fu(t)}function pu(n,t){var r=-1,e=n?n.length:0,u={};for(!e||t||za(n[0])||(t=[]);++r<e;){var i=n[r];t?u[i]=t[r]:i&&(u[i[0]]=i[1])}return u}function hu(n){var t=Y(n);return t.__chain__=!0,t}function vu(n,t,r){return t.call(r,n),n}function gu(n,t,r){return t.call(r,n)}function du(){return hu(this)}function yu(){var n=this.__wrapped__;return n instanceof Q?(this.__actions__.length&&(n=new Q(this)),new Z(n.reverse())):this.thru(function(n){return n.reverse()})}function _u(){return this.value()+""}function mu(){return Vr(this.__wrapped__,this.__actions__)}function wu(n){var t=n?n.length:0;return xe(t)&&(n=Ce(n)),sr(n,Ar(arguments,!1,!1,1))}function bu(n,t,r){var e=n?n.length:0;return xe(e)||(n=Ji(n),e=n.length),e?(r="number"==typeof r?0>r?va(e+r,0):r||0:0,"string"==typeof n||!za(n)&&Ri(n)?e>r&&n.indexOf(t,r)>-1:ve(n,t,r)>-1):!1}function xu(n,t,r){var e=za(n)?nr:wr;return("function"!=typeof t||"undefined"!=typeof r)&&(t=he(t,r,3)),e(n,t)}function Au(n,t,r){var e=za(n)?tr:br;return t=he(t,r,3),e(n,t)}function ju(n,t,r){if(za(n)){var e=Be(n,t,r);return e>-1?n[e]:b}return t=he(t,r,3),xr(n,t,_r)}function Eu(n,t,r){return t=he(t,r,3),xr(n,t,mr)}function Ru(n,t){return ju(n,bo(t))}function Iu(n,t,r){return"function"==typeof t&&"undefined"==typeof r&&za(n)?Ht(n,t):_r(n,Jr(t,r,3))}function ku(n,t,r){return"function"==typeof t&&"undefined"==typeof r&&za(n)?Qt(n,t):mr(n,Jr(t,r,3))}function Ou(n,t){return Cr(n,t,Mr(arguments,2))}function Cu(n,t,r){var e=za(n)?rr:Wr;return t=he(t,r,3),e(n,t)}function Tu(n,t){return Cu(n,Eo(t))}function Su(n,t,r,e){var u=za(n)?ir:zr;return u(n,he(t,e,4),r,arguments.length<3,_r)}function Nu(n,t,r,e){var u=za(n)?or:zr;return u(n,he(t,e,4),r,arguments.length<3,mr)}function Wu(n,t,r){var e=za(n)?tr:br;return t=he(t,r,3),e(n,function(n,r,e){return!t(n,r,e)})}function Fu(n,t,r){if(r?be(n,t,r):null==t){n=Ce(n);var e=n.length;return e>0?n[Dr(0,e-1)]:b}var u=Uu(n);return u.length=ga(0>t?0:+t||0,u.length),u}function Uu(n){n=Ce(n);for(var t=-1,r=n.length,e=Co(r);++t<r;){var u=Dr(0,t);t!=u&&(e[t]=e[u]),e[u]=n[t]}return e}function Lu(n){var t=n?n.length:0;return xe(t)?t:Ka(n).length}function $u(n,t,r){var e=za(n)?ar:qr;return("function"!=typeof t||"undefined"!=typeof r)&&(t=he(t,r,3)),e(n,t)}function Bu(n,t,e){var u=-1,i=n?n.length:0,o=xe(i)?Co(i):[];return e&&be(n,t,e)&&(t=null),t=he(t,e,3),_r(n,function(n,r,e){o[++u]={criteria:t(n,r,e),index:u,value:n}}),r(o,a)}function Du(n){var t=arguments;t.length>3&&be(t[1],t[2],t[3])&&(t=[n,t[1]]);var e=-1,u=n?n.length:0,i=Ar(t,!1,!1,1),o=xe(u)?Co(u):[];return _r(n,function(n){for(var t=i.length,r=Co(t);t--;)r[t]=null==n?b:n[i[t]];o[++e]={criteria:r,index:e,value:n}}),r(o,f)}function zu(n,t){return Au(n,bo(t))}function Mu(n,t){if(!_i(t)){if(!_i(n))throw new Bo(B);var r=n;n=t,t=r}return n=pa(n=+n)?n:0,function(){return--n<1?t.apply(this,arguments):void 0}}function qu(n,t,r){return r&&be(n,t,r)&&(t=null),t=n&&null==t?n.length:va(+t||0,0),fe(n,T,null,null,null,null,t)}function Pu(n,t){var r;if(!_i(t)){if(!_i(n))throw new Bo(B);var e=n;n=t,t=e}return function(){return--n>0?r=t.apply(this,arguments):t=null,r}}function Ku(n,t){var r=A;if(arguments.length>2){var e=Mr(arguments,2),u=g(e,Ku.placeholder);r|=k}return fe(n,r,t,e,u)}function Vu(n){return hr(n,arguments.length>1?Ar(arguments,!1,!1,1):Bi(n))}function Yu(n,t){var r=A|j;if(arguments.length>2){var e=Mr(arguments,2),u=g(e,Yu.placeholder);r|=k}return fe(t,r,n,e,u)}function Gu(n,t,r){r&&be(n,t,r)&&(t=null);var e=fe(n,R,null,null,null,null,null,t);return e.placeholder=Gu.placeholder,e}function Ju(n,t,r){r&&be(n,t,r)&&(t=null);var e=fe(n,I,null,null,null,null,null,t);return e.placeholder=Ju.placeholder,e}function Xu(n,t,r){function e(){p&&Qo(p),f&&Qo(f),f=p=h=b}function u(){var r=t-(Da()-l);if(0>=r||r>t){f&&Qo(f);var e=h;f=p=h=b,e&&(v=Da(),c=n.apply(s,a),p||f||(a=s=null))}else p=ia(u,r)}function i(){p&&Qo(p),f=p=h=b,(d||g!==t)&&(v=Da(),c=n.apply(s,a),p||f||(a=s=null))}function o(){if(a=arguments,l=Da(),s=this,h=d&&(p||!y),g===!1)var r=y&&!p;else{f||y||(v=l);var e=g-(l-v),o=0>=e||e>g;o?(f&&(f=Qo(f)),v=l,c=n.apply(s,a)):f||(f=ia(i,e))}return o&&p?p=Qo(p):p||t===g||(p=ia(u,t)),r&&(o=!0,c=n.apply(s,a)),!o||p||f||(a=s=null),c}var a,f,c,l,s,p,h,v=0,g=!1,d=!0;if(!_i(n))throw new Bo(B);if(t=0>t?0:t,r===!0){var y=!0;d=!1}else mi(r)&&(y=r.leading,g="maxWait"in r&&va(+r.maxWait||0,t),d="trailing"in r?r.trailing:d);return o.cancel=e,o}function Zu(n){return dr(n,1,arguments,1)}function Hu(n,t){return dr(n,t,arguments,2)}function Qu(){var n=arguments,t=n.length;if(!t)return function(){};if(!nr(n,_i))throw new Bo(B);return function(){for(var r=0,e=n[r].apply(this,arguments);++r<t;)e=n[r].call(this,e);return e}}function ni(){var n=arguments,t=n.length-1;if(0>t)return function(){};if(!nr(n,_i))throw new Bo(B);return function(){for(var r=t,e=n[r].apply(this,arguments);r--;)e=n[r].call(this,e);return e}}function ti(n,t){if(!_i(n)||t&&!_i(t))throw new Bo(B);var r=function(){var e=r.cache,u=t?t.apply(this,arguments):arguments[0];if(e.has(u))return e.get(u);var i=n.apply(this,arguments);return e.set(u,i),i};return r.cache=new ti.Cache,r}function ri(n){if(!_i(n))throw new Bo(B);return function(){return!n.apply(this,arguments)}}function ei(n){return Pu(n,2)}function ui(n){var t=Mr(arguments,1),r=g(t,ui.placeholder);return fe(n,k,null,t,r)}function ii(n){var t=Mr(arguments,1),r=g(t,ii.placeholder);return fe(n,O,null,t,r)}function oi(n){var t=Ar(arguments,!1,!1,1);return fe(n,C,null,null,null,t)}function ai(n,t,r){var e=!0,u=!0;if(!_i(n))throw new Bo(B);return r===!1?e=!1:mi(r)&&(e="leading"in r?!!r.leading:e,u="trailing"in r?!!r.trailing:u),Lt.leading=e,Lt.maxWait=+t,Lt.trailing=u,Xu(n,t,Lt)}function fi(n,t){return t=null==t?wo:t,fe(t,k,null,[n],[])}function ci(n,t,r,e){return"boolean"!=typeof t&&null!=t&&(e=r,r=be(n,t,e)?null:t,t=!1),r="function"==typeof r&&Jr(r,e,1),gr(n,t,r)}function li(n,t,r){return t="function"==typeof t&&Jr(t,r,1),gr(n,!0,t)}function si(n){var t=h(n)?n.length:b;return xe(t)&&Yo.call(n)==z||!1}function pi(n){return n===!0||n===!1||h(n)&&Yo.call(n)==q||!1}function hi(n){return h(n)&&Yo.call(n)==P||!1}function vi(n){return n&&1===n.nodeType&&h(n)&&Yo.call(n).indexOf("Element")>-1||!1}function gi(n){if(null==n)return!0;var t=n.length;return xe(t)&&(za(n)||Ri(n)||si(n)||h(n)&&_i(n.splice))?!t:!Ka(n).length}function di(n,t,r,e){if(r="function"==typeof r&&Jr(r,e,3),!r&&Ae(n)&&Ae(t))return n===t;var u=r?r(n,t):b;return"undefined"==typeof u?Tr(n,t,r):!!u}function yi(n){return h(n)&&"string"==typeof n.message&&Yo.call(n)==K||!1}function _i(n){return"function"==typeof n||!1}function mi(n){var t=typeof n;return"function"==t||n&&"object"==t||!1}function wi(n,t,r,e){var u=Ka(t),i=u.length;if(r="function"==typeof r&&Jr(r,e,3),!r&&1==i){var o=u[0],a=t[o];if(Ae(a))return null!=n&&a===n[o]&&Ko.call(n,o)}for(var f=Co(i),c=Co(i);i--;)a=f[i]=t[u[i]],c[i]=Ae(a);return Nr(n,u,f,c,r)}function bi(n){return ji(n)&&n!=+n}function xi(n){return null==n?!1:Yo.call(n)==V?Jo.test(qo.call(n)):h(n)&&jt.test(n)||!1}function Ai(n){return null===n}function ji(n){return"number"==typeof n||h(n)&&Yo.call(n)==G||!1}function Ei(n){return h(n)&&Yo.call(n)==X||!1}function Ri(n){return"string"==typeof n||h(n)&&Yo.call(n)==H||!1}function Ii(n){return h(n)&&xe(n.length)&&Ft[Yo.call(n)]||!1}function ki(n){return"undefined"==typeof n}function Oi(n){var t=n?n.length:0;return xe(t)?t?Zt(n):[]:Ji(n)}function Ci(n){return pr(n,Mi(n))}function Ti(n,t,r){var e=Oa(n);return r&&be(n,t,r)&&(t=null),t?pr(t,e,Ka(t)):e}function Si(n){if(null==n)return n;var t=Zt(arguments);return t.push(fr),Pa.apply(b,t)}function Ni(n,t,r){return t=he(t,r,3),xr(n,t,Ir,!0)}function Wi(n,t,r){return t=he(t,r,3),xr(n,t,kr,!0)}function Fi(n,t,r){return("function"!=typeof t||"undefined"!=typeof r)&&(t=Jr(t,r,3)),jr(n,t,Mi)}function Ui(n,t,r){return t=Jr(t,r,3),Er(n,t,Mi)}function Li(n,t,r){return("function"!=typeof t||"undefined"!=typeof r)&&(t=Jr(t,r,3)),Ir(n,t)}function $i(n,t,r){return t=Jr(t,r,3),Er(n,t,Ka)}function Bi(n){return Or(n,Mi(n))}function Di(n,t){return n?Ko.call(n,t):!1}function zi(n,t,r){r&&be(n,t,r)&&(t=null);for(var e=-1,u=Ka(n),i=u.length,o={};++e<i;){var a=u[e],f=n[a];t?Ko.call(o,f)?o[f].push(a):o[f]=[a]:o[f]=a}return o}function Mi(n){if(null==n)return[];mi(n)||(n=Uo(n));var t=n.length;t=t&&xe(t)&&(za(n)||ka.nonEnumArgs&&si(n))&&t||0;for(var r=n.constructor,e=-1,u="function"==typeof r&&r.prototype==n,i=Co(t),o=t>0;++e<t;)i[e]=e+"";for(var a in n)o&&we(a,t)||"constructor"==a&&(u||!Ko.call(n,a))||i.push(a);return i}function qi(n,t,r){var e={};return t=he(t,r,3),Ir(n,function(n,r,u){e[r]=t(n,r,u)}),e}function Pi(n,t,r){if(null==n)return{};if("function"!=typeof t){var e=rr(Ar(arguments,!1,!1,1),$o);return Ee(n,yr(Mi(n),e))}return t=Jr(t,r,3),Re(n,function(n,r,e){return!t(n,r,e)})}function Ki(n){for(var t=-1,r=Ka(n),e=r.length,u=Co(e);++t<e;){var i=r[t];u[t]=[i,n[i]]}return u}function Vi(n,t,r){return null==n?{}:"function"==typeof t?Re(n,Jr(t,r,3)):Ee(n,Ar(arguments,!1,!1,1))}function Yi(n,t,r){var e=null==n?b:n[t];return"undefined"==typeof e&&(e=r),_i(e)?e.call(n):e}function Gi(n,t,r,e){var u=za(n)||Ii(n);if(t=he(t,e,4),null==r)if(u||mi(n)){var i=n.constructor;r=u?za(n)?new i:[]:Oa("function"==typeof i&&i.prototype)}else r={};return(u?Ht:Ir)(n,function(n,e,u){return t(r,n,e,u)}),r}function Ji(n){return Kr(n,Ka(n))}function Xi(n){return Kr(n,Mi(n))}function Zi(n,t,r){r&&be(n,t,r)&&(t=r=null);var e=null==n,u=null==t;if(null==r&&(u&&"boolean"==typeof n?(r=n,n=1):"boolean"==typeof t&&(r=t,u=!0)),e&&u&&(t=1,u=!1),n=+n||0,u?(t=n,n=0):t=+t||0,r||n%1||t%1){var i=ma();return ga(n+i*(t-n+parseFloat("1e-"+((i+"").length-1))),t)}return Dr(n,t)}function Hi(n){return n=e(n),n&&n.charAt(0).toUpperCase()+n.slice(1)}function Qi(n){return n=e(n),n&&n.replace(Et,c)}function no(n,t,r){n=e(n),t+="";var u=n.length;return r=("undefined"==typeof r?u:ga(0>r?0:+r||0,u))-t.length,r>=0&&n.indexOf(t,r)==r}function to(n){return n=e(n),n&&dt.test(n)?n.replace(vt,l):n}function ro(n){return n=e(n),n&&kt.test(n)?n.replace(It,"\\$&"):n}function eo(n,t,r){n=e(n),t=+t;var u=n.length;if(u>=t||!pa(t))return n;var i=(t-u)/2,o=na(i),a=Ho(i);return r=oe("",a,r),r.slice(0,o)+n+r}function uo(n,t,r){return n=e(n),n&&oe(n,t,r)+n}function io(n,t,r){return n=e(n),n&&n+oe(n,t,r)}function oo(n,t,r){return r&&be(n,t,r)&&(t=0),_a(n,t)}function ao(n,t){var r="";if(n=e(n),t=+t,1>t||!n||!pa(t))return r;do t%2&&(r+=n),t=na(t/2),n+=n;while(t);return r}function fo(n,t,r){return n=e(n),r=null==r?0:ga(0>r?0:+r||0,n.length),n.lastIndexOf(t,r)==r}function co(n,t,r){var u=Y.templateSettings;r&&be(n,t,r)&&(t=r=null),n=e(n),t=lr(lr({},r||t),u,cr);var i,o,a=lr(lr({},t.imports),u.imports,cr),f=Ka(a),c=Kr(a,f),l=0,p=t.interpolate||Rt,h="__p += '",v=Lo((t.escape||Rt).source+"|"+p.source+"|"+(p===mt?wt:Rt).source+"|"+(t.evaluate||Rt).source+"|$","g"),g="//# sourceURL="+("sourceURL"in t?t.sourceURL:"lodash.templateSources["+ ++Wt+"]")+"\n";n.replace(v,function(t,r,e,u,a,f){return e||(e=u),h+=n.slice(l,f).replace(Ct,s),r&&(i=!0,h+="' +\n__e("+r+") +\n'"),a&&(o=!0,h+="';\n"+a+";\n__p += '"),e&&(h+="' +\n((__t = ("+e+")) == null ? '' : __t) +\n'"),l=f+t.length,t
}),h+="';\n";var d=t.variable;d||(h="with (obj) {\n"+h+"\n}\n"),h=(o?h.replace(lt,""):h).replace(st,"$1").replace(pt,"$1;"),h="function("+(d||"obj")+") {\n"+(d?"":"obj || (obj = {});\n")+"var __t, __p = ''"+(i?", __e = _.escape":"")+(o?", __j = Array.prototype.join;\nfunction print() { __p += __j.call(arguments, '') }\n":";\n")+h+"return __p\n}";var y=yo(function(){return No(f,g+"return "+h).apply(b,c)});if(y.source=h,yi(y))throw y;return y}function lo(n,t,r){var u=n;return(n=e(n))?(r?be(u,t,r):null==t)?n.slice(y(n),_(n)+1):(t=e(t),n.slice(i(n,t),o(n,t)+1)):n}function so(n,t,r){var u=n;return n=e(n),n?n.slice((r?be(u,t,r):null==t)?y(n):i(n,e(t))):n}function po(n,t,r){var u=n;return n=e(n),n?(r?be(u,t,r):null==t)?n.slice(0,_(n)+1):n.slice(0,o(n,e(t))+1):n}function ho(n,t,r){r&&be(n,t,r)&&(t=null);var u=S,i=N;if(null!=t)if(mi(t)){var o="separator"in t?t.separator:o;u="length"in t?+t.length||0:u,i="omission"in t?e(t.omission):i}else u=+t||0;if(n=e(n),u>=n.length)return n;var a=u-i.length;if(1>a)return i;var f=n.slice(0,a);if(null==o)return f+i;if(Ei(o)){if(n.slice(a).search(o)){var c,l,s=n.slice(0,a);for(o.global||(o=Lo(o.source,(bt.exec(o)||"")+"g")),o.lastIndex=0;c=o.exec(s);)l=c.index;f=f.slice(0,null==l?a:l)}}else if(n.indexOf(o,a)!=a){var p=f.lastIndexOf(o);p>-1&&(f=f.slice(0,p))}return f+i}function vo(n){return n=e(n),n&&gt.test(n)?n.replace(ht,m):n}function go(n,t,r){return r&&be(n,t,r)&&(t=null),n=e(n),n.match(t||Tt)||[]}function yo(n){try{return n()}catch(t){return yi(t)?t:So(t)}}function _o(n,t,r){return r&&be(n,t,r)&&(t=null),vr(n,t)}function mo(n){return function(){return n}}function wo(n){return n}function bo(n){return Fr(n,!0)}function xo(n,t,r){if(null==r){var e=mi(t),u=e&&Ka(t),i=u&&u.length&&Or(t,u);(i?i.length:e)||(i=!1,r=t,t=n,n=this)}i||(i=Or(t,Ka(t)));var o=!0,a=-1,f=_i(n),c=i.length;r===!1?o=!1:mi(r)&&"chain"in r&&(o=r.chain);for(;++a<c;){var l=i[a],s=t[l];n[l]=s,f&&(n.prototype[l]=function(t){return function(){var r=this.__chain__;if(o||r){var e=n(this.__wrapped__);return(e.__actions__=Zt(this.__actions__)).push({func:t,args:arguments,thisArg:n}),e.__chain__=r,e}var u=[this.value()];return ra.apply(u,arguments),t.apply(n,u)}}(s))}return n}function Ao(){return v._=Go,this}function jo(){}function Eo(n){return $r(n+"")}function Ro(n){return function(t){return null==n?b:n[t]}}function Io(n,t,r){r&&be(n,t,r)&&(t=r=null),n=+n||0,r=null==r?1:+r||0,null==t?(t=n,n=0):t=+t||0;for(var e=-1,u=va(Ho((t-n)/(r||1)),0),i=Co(u);++e<u;)i[e]=n,n+=r;return i}function ko(n,t,r){if(n=+n,1>n||!pa(n))return[];var e=-1,u=Co(ga(n,xa));for(t=Jr(t,r,1);++e<n;)xa>e?u[e]=t(e):t(e);return u}function Oo(n){var t=++Vo;return e(n)+t}v=v?Gt.defaults(qt.Object(),v,Gt.pick(qt,Nt)):qt;var Co=v.Array,To=v.Date,So=v.Error,No=v.Function,Wo=v.Math,Fo=v.Number,Uo=v.Object,Lo=v.RegExp,$o=v.String,Bo=v.TypeError,Do=Co.prototype,zo=Uo.prototype,Mo=(Mo=v.window)&&Mo.document,qo=No.prototype.toString,Po=$r("length"),Ko=zo.hasOwnProperty,Vo=0,Yo=zo.toString,Go=v._,Jo=Lo("^"+ro(Yo).replace(/toString|(function).*?(?=\\\()| for .+?(?=\\\])/g,"$1.*?")+"$"),Xo=xi(Xo=v.ArrayBuffer)&&Xo,Zo=xi(Zo=Xo&&new Xo(0).slice)&&Zo,Ho=Wo.ceil,Qo=v.clearTimeout,na=Wo.floor,ta=xi(ta=Uo.getPrototypeOf)&&ta,ra=Do.push,ea=zo.propertyIsEnumerable,ua=xi(ua=v.Set)&&ua,ia=v.setTimeout,oa=Do.splice,aa=xi(aa=v.Uint8Array)&&aa,fa=(Do.unshift,xi(fa=v.WeakMap)&&fa),ca=function(){try{var n=xi(n=v.Float64Array)&&n,t=new n(new Xo(10),0,1)&&n}catch(r){}return t}(),la=xi(la=Co.isArray)&&la,sa=xi(sa=Uo.create)&&sa,pa=v.isFinite,ha=xi(ha=Uo.keys)&&ha,va=Wo.max,ga=Wo.min,da=xi(da=To.now)&&da,ya=xi(ya=Fo.isFinite)&&ya,_a=v.parseInt,ma=Wo.random,wa=Fo.NEGATIVE_INFINITY,ba=Fo.POSITIVE_INFINITY,xa=Wo.pow(2,32)-1,Aa=xa-1,ja=xa>>>1,Ea=ca?ca.BYTES_PER_ELEMENT:0,Ra=Wo.pow(2,53)-1,Ia=fa&&new fa,ka=Y.support={};!function(){ka.funcDecomp=!xi(v.WinRTError)&&Ot.test(w),ka.funcNames="string"==typeof No.name;try{ka.dom=11===Mo.createDocumentFragment().nodeType}catch(n){ka.dom=!1}try{ka.nonEnumArgs=!ea.call(arguments,1)}catch(n){ka.nonEnumArgs=!0}}(0,0),Y.templateSettings={escape:yt,evaluate:_t,interpolate:mt,variable:"",imports:{_:Y}};var Oa=function(){function n(){}return function(t){if(mi(t)){n.prototype=t;var r=new n;n.prototype=null}return r||v.Object()}}(),Ca=Ia?function(n,t){return Ia.set(n,t),n}:wo;Zo||(Xr=Xo&&aa?function(n){var t=n.byteLength,r=ca?na(t/Ea):0,e=r*Ea,u=new Xo(t);if(r){var i=new ca(u,0,r);i.set(new ca(n,0,r))}return t!=e&&(i=new aa(u,e),i.set(new aa(n,e))),u}:mo(null));var Ta=sa&&ua?function(n){return new Yt(n)}:mo(null),Sa=Ia?function(n){return Ia.get(n)}:jo,Na=function(){var n=0,t=0;return function(r,e){var u=Da(),i=F-(u-t);if(t=u,i>0){if(++n>=W)return r}else n=0;return Ca(r,e)}}(),Wa=Qr(function(n,t,r){Ko.call(n,r)?++n[r]:n[r]=1}),Fa=Qr(function(n,t,r){Ko.call(n,r)?n[r].push(t):n[r]=[t]}),Ua=Qr(function(n,t,r){n[r]=t}),La=ue(er),$a=ue(ur,!0),Ba=Qr(function(n,t,r){n[r?0:1].push(t)},function(){return[[],[]]}),Da=da||function(){return(new To).getTime()},za=la||function(n){return h(n)&&xe(n.length)&&Yo.call(n)==M||!1};ka.dom||(vi=function(n){return n&&1===n.nodeType&&h(n)&&!qa(n)||!1});var Ma=ya||function(n){return"number"==typeof n&&pa(n)};(_i(/x/)||aa&&!_i(aa))&&(_i=function(n){return Yo.call(n)==V});var qa=ta?function(n){if(!n||Yo.call(n)!=J)return!1;var t=n.valueOf,r=xi(t)&&(r=ta(t))&&ta(r);return r?n==r||ta(n)==r:ke(n)}:ke,Pa=ne(lr),Ka=ha?function(n){if(n)var t=n.constructor,r=n.length;return"function"==typeof t&&t.prototype===n||"function"!=typeof n&&r&&xe(r)?Oe(n):mi(n)?ha(n):[]}:Oe,Va=ne(Ur),Ya=re(function(n,t,r){return t=t.toLowerCase(),r?n+t.charAt(0).toUpperCase()+t.slice(1):t}),Ga=re(function(n,t,r){return n+(r?"-":"")+t.toLowerCase()});8!=_a(St+"08")&&(oo=function(n,t,r){return(r?be(n,t,r):null==t)?t=0:t&&(t=+t),n=lo(n),_a(n,t||(At.test(n)?16:10))});var Ja=re(function(n,t,r){return n+(r?"_":"")+t.toLowerCase()});return Z.prototype=Y.prototype,zt.prototype["delete"]=Mt,zt.prototype.get=Pt,zt.prototype.has=Kt,zt.prototype.set=Vt,Yt.prototype.push=Xt,ti.Cache=zt,Y.after=Mu,Y.ary=qu,Y.assign=Pa,Y.at=wu,Y.before=Pu,Y.bind=Ku,Y.bindAll=Vu,Y.bindKey=Yu,Y.callback=_o,Y.chain=hu,Y.chunk=Se,Y.compact=Ne,Y.constant=mo,Y.countBy=Wa,Y.create=Ti,Y.curry=Gu,Y.curryRight=Ju,Y.debounce=Xu,Y.defaults=Si,Y.defer=Zu,Y.delay=Hu,Y.difference=We,Y.drop=Fe,Y.dropRight=Ue,Y.dropRightWhile=Le,Y.dropWhile=$e,Y.filter=Au,Y.flatten=Me,Y.flattenDeep=qe,Y.flow=Qu,Y.flowRight=ni,Y.forEach=Iu,Y.forEachRight=ku,Y.forIn=Fi,Y.forInRight=Ui,Y.forOwn=Li,Y.forOwnRight=$i,Y.functions=Bi,Y.groupBy=Fa,Y.indexBy=Ua,Y.initial=Ke,Y.intersection=Ve,Y.invert=zi,Y.invoke=Ou,Y.keys=Ka,Y.keysIn=Mi,Y.map=Cu,Y.mapValues=qi,Y.matches=bo,Y.memoize=ti,Y.merge=Va,Y.mixin=xo,Y.negate=ri,Y.omit=Pi,Y.once=ei,Y.pairs=Ki,Y.partial=ui,Y.partialRight=ii,Y.partition=Ba,Y.pick=Vi,Y.pluck=Tu,Y.property=Eo,Y.propertyOf=Ro,Y.pull=Je,Y.pullAt=Xe,Y.range=Io,Y.rearg=oi,Y.reject=Wu,Y.remove=Ze,Y.rest=He,Y.shuffle=Uu,Y.slice=Qe,Y.sortBy=Bu,Y.sortByAll=Du,Y.take=ru,Y.takeRight=eu,Y.takeRightWhile=uu,Y.takeWhile=iu,Y.tap=vu,Y.throttle=ai,Y.thru=gu,Y.times=ko,Y.toArray=Oi,Y.toPlainObject=Ci,Y.transform=Gi,Y.union=ou,Y.uniq=au,Y.unzip=fu,Y.values=Ji,Y.valuesIn=Xi,Y.where=zu,Y.without=cu,Y.wrap=fi,Y.xor=lu,Y.zip=su,Y.zipObject=pu,Y.backflow=ni,Y.collect=Cu,Y.compose=ni,Y.each=Iu,Y.eachRight=ku,Y.extend=Pa,Y.iteratee=_o,Y.methods=Bi,Y.object=pu,Y.select=Au,Y.tail=He,Y.unique=au,xo(Y,Y),Y.attempt=yo,Y.camelCase=Ya,Y.capitalize=Hi,Y.clone=ci,Y.cloneDeep=li,Y.deburr=Qi,Y.endsWith=no,Y.escape=to,Y.escapeRegExp=ro,Y.every=xu,Y.find=ju,Y.findIndex=Be,Y.findKey=Ni,Y.findLast=Eu,Y.findLastIndex=De,Y.findLastKey=Wi,Y.findWhere=Ru,Y.first=ze,Y.has=Di,Y.identity=wo,Y.includes=bu,Y.indexOf=Pe,Y.isArguments=si,Y.isArray=za,Y.isBoolean=pi,Y.isDate=hi,Y.isElement=vi,Y.isEmpty=gi,Y.isEqual=di,Y.isError=yi,Y.isFinite=Ma,Y.isFunction=_i,Y.isMatch=wi,Y.isNaN=bi,Y.isNative=xi,Y.isNull=Ai,Y.isNumber=ji,Y.isObject=mi,Y.isPlainObject=qa,Y.isRegExp=Ei,Y.isString=Ri,Y.isTypedArray=Ii,Y.isUndefined=ki,Y.kebabCase=Ga,Y.last=Ye,Y.lastIndexOf=Ge,Y.max=La,Y.min=$a,Y.noConflict=Ao,Y.noop=jo,Y.now=Da,Y.pad=eo,Y.padLeft=uo,Y.padRight=io,Y.parseInt=oo,Y.random=Zi,Y.reduce=Su,Y.reduceRight=Nu,Y.repeat=ao,Y.result=Yi,Y.runInContext=w,Y.size=Lu,Y.snakeCase=Ja,Y.some=$u,Y.sortedIndex=nu,Y.sortedLastIndex=tu,Y.startsWith=fo,Y.template=co,Y.trim=lo,Y.trimLeft=so,Y.trimRight=po,Y.trunc=ho,Y.unescape=vo,Y.uniqueId=Oo,Y.words=go,Y.all=xu,Y.any=$u,Y.contains=bu,Y.detect=ju,Y.foldl=Su,Y.foldr=Nu,Y.head=ze,Y.include=bu,Y.inject=Su,xo(Y,function(){var n={};return Ir(Y,function(t,r){Y.prototype[r]||(n[r]=t)}),n}(),!1),Y.sample=Fu,Y.prototype.sample=function(n){return this.__chain__||null!=n?this.thru(function(t){return Fu(t,n)}):Fu(this.value())},Y.VERSION=x,Ht(["bind","bindKey","curry","curryRight","partial","partialRight"],function(n){Y[n].placeholder=Y}),Ht(["filter","map","takeWhile"],function(n,t){var r=t==U;Q.prototype[n]=function(n,e){var u=this.clone(),i=u.filtered,o=u.iteratees||(u.iteratees=[]);return u.filtered=i||r||t==$&&u.dir<0,o.push({iteratee:he(n,e,3),type:t}),u}}),Ht(["drop","take"],function(n,t){var r=n+"Count",e=n+"While";Q.prototype[n]=function(e){e=null==e?1:va(+e||0,0);var u=this.clone();if(u.filtered){var i=u[r];u[r]=t?ga(i,e):i+e}else{var o=u.views||(u.views=[]);o.push({size:e,type:n+(u.dir<0?"Right":"")})}return u},Q.prototype[n+"Right"]=function(t){return this.reverse()[n](t).reverse()},Q.prototype[n+"RightWhile"]=function(n,t){return this.reverse()[e](n,t).reverse()}}),Ht(["first","last"],function(n,t){var r="take"+(t?"Right":"");Q.prototype[n]=function(){return this[r](1).value()[0]}}),Ht(["initial","rest"],function(n,t){var r="drop"+(t?"":"Right");Q.prototype[n]=function(){return this[r](1)}}),Ht(["pluck","where"],function(n,t){var r=t?"filter":"map",e=t?bo:Eo;Q.prototype[n]=function(n){return this[r](e(n))}}),Q.prototype.dropWhile=function(n,t){var r,e,u=this.dir<0;return n=he(n,t,3),this.filter(function(t,i,o){return r=r&&(u?e>i:i>e),e=i,r||(r=!n(t,i,o))})},Q.prototype.reject=function(n,t){return n=he(n,t,3),this.filter(function(t,r,e){return!n(t,r,e)})},Q.prototype.slice=function(n,t){n=null==n?0:+n||0;var r=0>n?this.takeRight(-n):this.drop(n);return"undefined"!=typeof t&&(t=+t||0,r=0>t?r.dropRight(-t):r.take(t-n)),r},Ir(Q.prototype,function(n,t){var r=Y[t],e=/^(?:first|last)$/.test(t);Y.prototype[t]=function(){var t=this.__wrapped__,u=arguments,i=this.__chain__,o=!!this.__actions__.length,a=t instanceof Q,f=a&&!o;if(e&&!i)return f?n.call(t):r.call(Y,this.value());var c=function(n){var t=[n];return ra.apply(t,u),r.apply(Y,t)};if(a||za(t)){var l=f?t:new Q(this),s=n.apply(l,u);if(!e&&(o||s.actions)){var p=s.actions||(s.actions=[]);p.push({func:gu,args:[c],thisArg:Y})}return new Z(s,i)}return this.thru(c)}}),Ht(["concat","join","pop","push","shift","sort","splice","unshift"],function(n){var t=Do[n],r=/^(?:push|sort|unshift)$/.test(n)?"tap":"thru",e=/^(?:join|pop|shift)$/.test(n);Y.prototype[n]=function(){var n=arguments;return e&&!this.__chain__?t.apply(this.value(),n):this[r](function(r){return t.apply(r,n)})}}),Q.prototype.clone=$t,Q.prototype.reverse=Bt,Q.prototype.value=Dt,Y.prototype.chain=du,Y.prototype.reverse=yu,Y.prototype.toString=_u,Y.prototype.toJSON=Y.prototype.valueOf=Y.prototype.value=mu,Y.prototype.collect=Y.prototype.map,Y.prototype.head=Y.prototype.first,Y.prototype.select=Y.prototype.filter,Y.prototype.tail=Y.prototype.rest,Y}var b,x="3.0.1",A=1,j=2,E=4,R=8,I=16,k=32,O=64,C=128,T=256,S=30,N="...",W=150,F=16,U=0,L=1,$=2,B="Expected a function",D="__lodash_placeholder__",z="[object Arguments]",M="[object Array]",q="[object Boolean]",P="[object Date]",K="[object Error]",V="[object Function]",Y="[object Map]",G="[object Number]",J="[object Object]",X="[object RegExp]",Z="[object Set]",H="[object String]",Q="[object WeakMap]",nt="[object ArrayBuffer]",tt="[object Float32Array]",rt="[object Float64Array]",et="[object Int8Array]",ut="[object Int16Array]",it="[object Int32Array]",ot="[object Uint8Array]",at="[object Uint8ClampedArray]",ft="[object Uint16Array]",ct="[object Uint32Array]",lt=/\b__p \+= '';/g,st=/\b(__p \+=) '' \+/g,pt=/(__e\(.*?\)|\b__t\)) \+\n'';/g,ht=/&(?:amp|lt|gt|quot|#39|#96);/g,vt=/[&<>"'`]/g,gt=RegExp(ht.source),dt=RegExp(vt.source),yt=/<%-([\s\S]+?)%>/g,_t=/<%([\s\S]+?)%>/g,mt=/<%=([\s\S]+?)%>/g,wt=/\$\{([^\\}]*(?:\\.[^\\}]*)*)\}/g,bt=/\w*$/,xt=/^\s*function[ \n\r\t]+\w/,At=/^0[xX]/,jt=/^\[object .+?Constructor\]$/,Et=/[\xc0-\xd6\xd8-\xde\xdf-\xf6\xf8-\xff]/g,Rt=/($^)/,It=/[.*+?^${}()|[\]\/\\]/g,kt=RegExp(It.source),Ot=/\bthis\b/,Ct=/['\n\r\u2028\u2029\\]/g,Tt=function(){var n="[A-Z\\xc0-\\xd6\\xd8-\\xde]",t="[a-z\\xdf-\\xf6\\xf8-\\xff]+";return RegExp(n+"{2,}(?="+n+t+")|"+n+"?"+t+"|"+n+"+|[0-9]+","g")}(),St=" 	\f ﻿\n\r\u2028\u2029 ᠎             　",Nt=["Array","ArrayBuffer","Date","Error","Float32Array","Float64Array","Function","Int8Array","Int16Array","Int32Array","Math","Number","Object","RegExp","Set","String","_","clearTimeout","document","isFinite","parseInt","setTimeout","TypeError","Uint8Array","Uint8ClampedArray","Uint16Array","Uint32Array","WeakMap","window","WinRTError"],Wt=-1,Ft={};Ft[tt]=Ft[rt]=Ft[et]=Ft[ut]=Ft[it]=Ft[ot]=Ft[at]=Ft[ft]=Ft[ct]=!0,Ft[z]=Ft[M]=Ft[nt]=Ft[q]=Ft[P]=Ft[K]=Ft[V]=Ft[Y]=Ft[G]=Ft[J]=Ft[X]=Ft[Z]=Ft[H]=Ft[Q]=!1;var Ut={};Ut[z]=Ut[M]=Ut[nt]=Ut[q]=Ut[P]=Ut[tt]=Ut[rt]=Ut[et]=Ut[ut]=Ut[it]=Ut[G]=Ut[J]=Ut[X]=Ut[H]=Ut[ot]=Ut[at]=Ut[ft]=Ut[ct]=!0,Ut[K]=Ut[V]=Ut[Y]=Ut[Z]=Ut[Q]=!1;var Lt={leading:!1,maxWait:0,trailing:!1},$t={"À":"A","Á":"A","Â":"A","Ã":"A","Ä":"A","Å":"A","à":"a","á":"a","â":"a","ã":"a","ä":"a","å":"a","Ç":"C","ç":"c","Ð":"D","ð":"d","È":"E","É":"E","Ê":"E","Ë":"E","è":"e","é":"e","ê":"e","ë":"e","Ì":"I","Í":"I","Î":"I","Ï":"I","ì":"i","í":"i","î":"i","ï":"i","Ñ":"N","ñ":"n","Ò":"O","Ó":"O","Ô":"O","Õ":"O","Ö":"O","Ø":"O","ò":"o","ó":"o","ô":"o","õ":"o","ö":"o","ø":"o","Ù":"U","Ú":"U","Û":"U","Ü":"U","ù":"u","ú":"u","û":"u","ü":"u","Ý":"Y","ý":"y","ÿ":"y","Æ":"Ae","æ":"ae","Þ":"Th","þ":"th","ß":"ss"},Bt={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;","`":"&#96;"},Dt={"&amp;":"&","&lt;":"<","&gt;":">","&quot;":'"',"&#39;":"'","&#96;":"`"},zt={"function":!0,object:!0},Mt={"\\":"\\","'":"'","\n":"n","\r":"r","\u2028":"u2028","\u2029":"u2029"},qt=zt[typeof window]&&window!==(this&&this.window)?window:this,Pt=zt[typeof exports]&&exports&&!exports.nodeType&&exports,Kt=zt[typeof module]&&module&&!module.nodeType&&module,Vt=Pt&&Kt&&"object"==typeof global&&global;!Vt||Vt.global!==Vt&&Vt.window!==Vt&&Vt.self!==Vt||(qt=Vt);var Yt=Kt&&Kt.exports===Pt&&Pt,Gt=w();"function"==typeof define&&"object"==typeof define.amd&&define.amd?(qt._=Gt,define(function(){return Gt})):Pt&&Kt?Yt?(Kt.exports=Gt)._=Gt:Pt._=Gt:qt._=Gt}).call(this);


}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],13:[function(require,module,exports){
!function(t){if("object"==typeof exports)module.exports=t();else if("function"==typeof define&&define.amd)define(t);else{var r;try{r=window}catch(e){r=self}r.SparkMD5=t()}}(function(){"use strict";var t=function(t,r){return t+r&4294967295},r=function(r,e,n,i,f,o){return e=t(t(e,r),t(i,o)),t(e<<f|e>>>32-f,n)},e=function(t,e,n,i,f,o,s){return r(e&n|~e&i,t,e,f,o,s)},n=function(t,e,n,i,f,o,s){return r(e&i|n&~i,t,e,f,o,s)},i=function(t,e,n,i,f,o,s){return r(e^n^i,t,e,f,o,s)},f=function(t,e,n,i,f,o,s){return r(n^(e|~i),t,e,f,o,s)},o=function(r,o){var s=r[0],u=r[1],a=r[2],h=r[3];s=e(s,u,a,h,o[0],7,-680876936),h=e(h,s,u,a,o[1],12,-389564586),a=e(a,h,s,u,o[2],17,606105819),u=e(u,a,h,s,o[3],22,-1044525330),s=e(s,u,a,h,o[4],7,-176418897),h=e(h,s,u,a,o[5],12,1200080426),a=e(a,h,s,u,o[6],17,-1473231341),u=e(u,a,h,s,o[7],22,-45705983),s=e(s,u,a,h,o[8],7,1770035416),h=e(h,s,u,a,o[9],12,-1958414417),a=e(a,h,s,u,o[10],17,-42063),u=e(u,a,h,s,o[11],22,-1990404162),s=e(s,u,a,h,o[12],7,1804603682),h=e(h,s,u,a,o[13],12,-40341101),a=e(a,h,s,u,o[14],17,-1502002290),u=e(u,a,h,s,o[15],22,1236535329),s=n(s,u,a,h,o[1],5,-165796510),h=n(h,s,u,a,o[6],9,-1069501632),a=n(a,h,s,u,o[11],14,643717713),u=n(u,a,h,s,o[0],20,-373897302),s=n(s,u,a,h,o[5],5,-701558691),h=n(h,s,u,a,o[10],9,38016083),a=n(a,h,s,u,o[15],14,-660478335),u=n(u,a,h,s,o[4],20,-405537848),s=n(s,u,a,h,o[9],5,568446438),h=n(h,s,u,a,o[14],9,-1019803690),a=n(a,h,s,u,o[3],14,-187363961),u=n(u,a,h,s,o[8],20,1163531501),s=n(s,u,a,h,o[13],5,-1444681467),h=n(h,s,u,a,o[2],9,-51403784),a=n(a,h,s,u,o[7],14,1735328473),u=n(u,a,h,s,o[12],20,-1926607734),s=i(s,u,a,h,o[5],4,-378558),h=i(h,s,u,a,o[8],11,-2022574463),a=i(a,h,s,u,o[11],16,1839030562),u=i(u,a,h,s,o[14],23,-35309556),s=i(s,u,a,h,o[1],4,-1530992060),h=i(h,s,u,a,o[4],11,1272893353),a=i(a,h,s,u,o[7],16,-155497632),u=i(u,a,h,s,o[10],23,-1094730640),s=i(s,u,a,h,o[13],4,681279174),h=i(h,s,u,a,o[0],11,-358537222),a=i(a,h,s,u,o[3],16,-722521979),u=i(u,a,h,s,o[6],23,76029189),s=i(s,u,a,h,o[9],4,-640364487),h=i(h,s,u,a,o[12],11,-421815835),a=i(a,h,s,u,o[15],16,530742520),u=i(u,a,h,s,o[2],23,-995338651),s=f(s,u,a,h,o[0],6,-198630844),h=f(h,s,u,a,o[7],10,1126891415),a=f(a,h,s,u,o[14],15,-1416354905),u=f(u,a,h,s,o[5],21,-57434055),s=f(s,u,a,h,o[12],6,1700485571),h=f(h,s,u,a,o[3],10,-1894986606),a=f(a,h,s,u,o[10],15,-1051523),u=f(u,a,h,s,o[1],21,-2054922799),s=f(s,u,a,h,o[8],6,1873313359),h=f(h,s,u,a,o[15],10,-30611744),a=f(a,h,s,u,o[6],15,-1560198380),u=f(u,a,h,s,o[13],21,1309151649),s=f(s,u,a,h,o[4],6,-145523070),h=f(h,s,u,a,o[11],10,-1120210379),a=f(a,h,s,u,o[2],15,718787259),u=f(u,a,h,s,o[9],21,-343485551),r[0]=t(s,r[0]),r[1]=t(u,r[1]),r[2]=t(a,r[2]),r[3]=t(h,r[3])},s=function(t){var r,e=[];for(r=0;64>r;r+=4)e[r>>2]=t.charCodeAt(r)+(t.charCodeAt(r+1)<<8)+(t.charCodeAt(r+2)<<16)+(t.charCodeAt(r+3)<<24);return e},u=function(t){var r,e=[];for(r=0;64>r;r+=4)e[r>>2]=t[r]+(t[r+1]<<8)+(t[r+2]<<16)+(t[r+3]<<24);return e},a=function(t){var r,e,n,i,f,u,a=t.length,h=[1732584193,-271733879,-1732584194,271733878];for(r=64;a>=r;r+=64)o(h,s(t.substring(r-64,r)));for(t=t.substring(r-64),e=t.length,n=[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],r=0;e>r;r+=1)n[r>>2]|=t.charCodeAt(r)<<(r%4<<3);if(n[r>>2]|=128<<(r%4<<3),r>55)for(o(h,n),r=0;16>r;r+=1)n[r]=0;return i=8*a,i=i.toString(16).match(/(.*?)(.{0,8})$/),f=parseInt(i[2],16),u=parseInt(i[1],16)||0,n[14]=f,n[15]=u,o(h,n),h},h=function(t){var r,e,n,i,f,s,a=t.length,h=[1732584193,-271733879,-1732584194,271733878];for(r=64;a>=r;r+=64)o(h,u(t.subarray(r-64,r)));for(t=a>r-64?t.subarray(r-64):new Uint8Array(0),e=t.length,n=[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],r=0;e>r;r+=1)n[r>>2]|=t[r]<<(r%4<<3);if(n[r>>2]|=128<<(r%4<<3),r>55)for(o(h,n),r=0;16>r;r+=1)n[r]=0;return i=8*a,i=i.toString(16).match(/(.*?)(.{0,8})$/),f=parseInt(i[2],16),s=parseInt(i[1],16)||0,n[14]=f,n[15]=s,o(h,n),h},c=["0","1","2","3","4","5","6","7","8","9","a","b","c","d","e","f"],p=function(t){var r,e="";for(r=0;4>r;r+=1)e+=c[t>>8*r+4&15]+c[t>>8*r&15];return e},y=function(t){var r;for(r=0;r<t.length;r+=1)t[r]=p(t[r]);return t.join("")},_=function(t){return y(a(t))},d=function(){this.reset()};return"5d41402abc4b2a76b9719d911017c592"!==_("hello")&&(t=function(t,r){var e=(65535&t)+(65535&r),n=(t>>16)+(r>>16)+(e>>16);return n<<16|65535&e}),d.prototype.append=function(t){return/[\u0080-\uFFFF]/.test(t)&&(t=unescape(encodeURIComponent(t))),this.appendBinary(t),this},d.prototype.appendBinary=function(t){this._buff+=t,this._length+=t.length;var r,e=this._buff.length;for(r=64;e>=r;r+=64)o(this._state,s(this._buff.substring(r-64,r)));return this._buff=this._buff.substr(r-64),this},d.prototype.end=function(t){var r,e,n=this._buff,i=n.length,f=[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];for(r=0;i>r;r+=1)f[r>>2]|=n.charCodeAt(r)<<(r%4<<3);return this._finish(f,i),e=t?this._state:y(this._state),this.reset(),e},d.prototype._finish=function(t,r){var e,n,i,f=r;if(t[f>>2]|=128<<(f%4<<3),f>55)for(o(this._state,t),f=0;16>f;f+=1)t[f]=0;e=8*this._length,e=e.toString(16).match(/(.*?)(.{0,8})$/),n=parseInt(e[2],16),i=parseInt(e[1],16)||0,t[14]=n,t[15]=i,o(this._state,t)},d.prototype.reset=function(){return this._buff="",this._length=0,this._state=[1732584193,-271733879,-1732584194,271733878],this},d.prototype.destroy=function(){delete this._state,delete this._buff,delete this._length},d.hash=function(t,r){/[\u0080-\uFFFF]/.test(t)&&(t=unescape(encodeURIComponent(t)));var e=a(t);return r?e:y(e)},d.hashBinary=function(t,r){var e=a(t);return r?e:y(e)},d.ArrayBuffer=function(){this.reset()},d.ArrayBuffer.prototype.append=function(t){var r,e=this._concatArrayBuffer(this._buff,t),n=e.length;for(this._length+=t.byteLength,r=64;n>=r;r+=64)o(this._state,u(e.subarray(r-64,r)));return this._buff=n>r-64?e.subarray(r-64):new Uint8Array(0),this},d.ArrayBuffer.prototype.end=function(t){var r,e,n=this._buff,i=n.length,f=[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];for(r=0;i>r;r+=1)f[r>>2]|=n[r]<<(r%4<<3);return this._finish(f,i),e=t?this._state:y(this._state),this.reset(),e},d.ArrayBuffer.prototype._finish=d.prototype._finish,d.ArrayBuffer.prototype.reset=function(){return this._buff=new Uint8Array(0),this._length=0,this._state=[1732584193,-271733879,-1732584194,271733878],this},d.ArrayBuffer.prototype.destroy=d.prototype.destroy,d.ArrayBuffer.prototype._concatArrayBuffer=function(t,r){var e=t.length,n=new Uint8Array(e+r.byteLength);return n.set(t),n.set(new Uint8Array(r),e),n},d.ArrayBuffer.hash=function(t,r){var e=h(new Uint8Array(t));return r?e:y(e)},d});


},{}],14:[function(require,module,exports){
function noop(){}function isHost(t){var e={}.toString.call(t);switch(e){case"[object File]":case"[object Blob]":case"[object FormData]":return!0;default:return!1}}function getXHR(){if(root.XMLHttpRequest&&("file:"!=root.location.protocol||!root.ActiveXObject))return new XMLHttpRequest;try{return new ActiveXObject("Microsoft.XMLHTTP")}catch(t){}try{return new ActiveXObject("Msxml2.XMLHTTP.6.0")}catch(t){}try{return new ActiveXObject("Msxml2.XMLHTTP.3.0")}catch(t){}try{return new ActiveXObject("Msxml2.XMLHTTP")}catch(t){}return!1}function isObject(t){return t===Object(t)}function serialize(t){if(!isObject(t))return t;var e=[];for(var r in t)null!=t[r]&&e.push(encodeURIComponent(r)+"="+encodeURIComponent(t[r]));return e.join("&")}function parseString(t){for(var e,r,s={},i=t.split("&"),o=0,n=i.length;n>o;++o)r=i[o],e=r.split("="),s[decodeURIComponent(e[0])]=decodeURIComponent(e[1]);return s}function parseHeader(t){var e,r,s,i,o=t.split(/\r?\n/),n={};o.pop();for(var u=0,a=o.length;a>u;++u)r=o[u],e=r.indexOf(":"),s=r.slice(0,e).toLowerCase(),i=trim(r.slice(e+1)),n[s]=i;return n}function type(t){return t.split(/ *; */).shift()}function params(t){return reduce(t.split(/ *; */),function(t,e){var r=e.split(/ *= */),s=r.shift(),i=r.shift();return s&&i&&(t[s]=i),t},{})}function Response(t,e){e=e||{},this.req=t,this.xhr=this.req.xhr,this.text="HEAD"!=this.req.method?this.xhr.responseText:null,this.setStatusProperties(this.xhr.status),this.header=this.headers=parseHeader(this.xhr.getAllResponseHeaders()),this.header["content-type"]=this.xhr.getResponseHeader("content-type"),this.setHeaderProperties(this.header),this.body="HEAD"!=this.req.method?this.parseBody(this.text):null}function Request(t,e){var r=this;Emitter.call(this),this._query=this._query||[],this.method=t,this.url=e,this.header={},this._header={},this.on("end",function(){var t=null,e=null;try{e=new Response(r)}catch(s){t=new Error("Parser is unable to parse the response"),t.parse=!0,t.original=s}r.callback(t,e)})}function request(t,e){return"function"==typeof e?new Request("GET",t).end(e):1==arguments.length?new Request("GET",t):new Request(t,e)}var Emitter=require("emitter"),reduce=require("reduce"),root="undefined"==typeof window?this:window,trim="".trim?function(t){return t.trim()}:function(t){return t.replace(/(^\s*|\s*$)/g,"")};request.serializeObject=serialize,request.parseString=parseString,request.types={html:"text/html",json:"application/json",xml:"application/xml",urlencoded:"application/x-www-form-urlencoded",form:"application/x-www-form-urlencoded","form-data":"application/x-www-form-urlencoded"},request.serialize={"application/x-www-form-urlencoded":serialize,"application/json":JSON.stringify},request.parse={"application/x-www-form-urlencoded":parseString,"application/json":JSON.parse},Response.prototype.get=function(t){return this.header[t.toLowerCase()]},Response.prototype.setHeaderProperties=function(){var t=this.header["content-type"]||"";this.type=type(t);var e=params(t);for(var r in e)this[r]=e[r]},Response.prototype.parseBody=function(t){var e=request.parse[this.type];return e&&t&&t.length?e(t):null},Response.prototype.setStatusProperties=function(t){var e=t/100|0;this.status=t,this.statusType=e,this.info=1==e,this.ok=2==e,this.clientError=4==e,this.serverError=5==e,this.error=4==e||5==e?this.toError():!1,this.accepted=202==t,this.noContent=204==t||1223==t,this.badRequest=400==t,this.unauthorized=401==t,this.notAcceptable=406==t,this.notFound=404==t,this.forbidden=403==t},Response.prototype.toError=function(){var t=this.req,e=t.method,r=t.url,s="cannot "+e+" "+r+" ("+this.status+")",i=new Error(s);return i.status=this.status,i.method=e,i.url=r,i},request.Response=Response,Emitter(Request.prototype),Request.prototype.use=function(t){return t(this),this},Request.prototype.timeout=function(t){return this._timeout=t,this},Request.prototype.clearTimeout=function(){return this._timeout=0,clearTimeout(this._timer),this},Request.prototype.abort=function(){return this.aborted?void 0:(this.aborted=!0,this.xhr.abort(),this.clearTimeout(),this.emit("abort"),this)},Request.prototype.set=function(t,e){if(isObject(t)){for(var r in t)this.set(r,t[r]);return this}return this._header[t.toLowerCase()]=e,this.header[t]=e,this},Request.prototype.unset=function(t){return delete this._header[t.toLowerCase()],delete this.header[t],this},Request.prototype.getHeader=function(t){return this._header[t.toLowerCase()]},Request.prototype.type=function(t){return this.set("Content-Type",request.types[t]||t),this},Request.prototype.accept=function(t){return this.set("Accept",request.types[t]||t),this},Request.prototype.auth=function(t,e){var r=btoa(t+":"+e);return this.set("Authorization","Basic "+r),this},Request.prototype.query=function(t){return"string"!=typeof t&&(t=serialize(t)),t&&this._query.push(t),this},Request.prototype.field=function(t,e){return this._formData||(this._formData=new FormData),this._formData.append(t,e),this},Request.prototype.attach=function(t,e,r){return this._formData||(this._formData=new FormData),this._formData.append(t,e,r),this},Request.prototype.send=function(t){var e=isObject(t),r=this.getHeader("Content-Type");if(e&&isObject(this._data))for(var s in t)this._data[s]=t[s];else"string"==typeof t?(r||this.type("form"),r=this.getHeader("Content-Type"),this._data="application/x-www-form-urlencoded"==r?this._data?this._data+"&"+t:t:(this._data||"")+t):this._data=t;return e?(r||this.type("json"),this):this},Request.prototype.callback=function(t,e){var r=this._callback;return this.clearTimeout(),2==r.length?r(t,e):t?this.emit("error",t):void r(e)},Request.prototype.crossDomainError=function(){var t=new Error("Origin is not allowed by Access-Control-Allow-Origin");t.crossDomain=!0,this.callback(t)},Request.prototype.timeoutError=function(){var t=this._timeout,e=new Error("timeout of "+t+"ms exceeded");e.timeout=t,this.callback(e)},Request.prototype.withCredentials=function(){return this._withCredentials=!0,this},Request.prototype.end=function(t){var e=this,r=this.xhr=getXHR(),s=this._query.join("&"),i=this._timeout,o=this._formData||this._data;if(this._callback=t||noop,r.onreadystatechange=function(){return 4==r.readyState?0==r.status?e.aborted?e.timeoutError():e.crossDomainError():void e.emit("end"):void 0},r.upload&&(r.upload.onprogress=function(t){t.percent=t.loaded/t.total*100,e.emit("progress",t)}),i&&!this._timer&&(this._timer=setTimeout(function(){e.abort()},i)),s&&(s=request.serializeObject(s),this.url+=~this.url.indexOf("?")?"&"+s:"?"+s),r.open(this.method,this.url,!0),this._withCredentials&&(r.withCredentials=!0),"GET"!=this.method&&"HEAD"!=this.method&&"string"!=typeof o&&!isHost(o)){var n=request.serialize[this.getHeader("Content-Type")];n&&(o=n(o))}for(var u in this.header)null!=this.header[u]&&r.setRequestHeader(u,this.header[u]);return this.emit("request",this),r.send(o),this},request.Request=Request,request.get=function(t,e,r){var s=request("GET",t);return"function"==typeof e&&(r=e,e=null),e&&s.query(e),r&&s.end(r),s},request.head=function(t,e,r){var s=request("HEAD",t);return"function"==typeof e&&(r=e,e=null),e&&s.send(e),r&&s.end(r),s},request.del=function(t,e){var r=request("DELETE",t);return e&&r.end(e),r},request.patch=function(t,e,r){var s=request("PATCH",t);return"function"==typeof e&&(r=e,e=null),e&&s.send(e),r&&s.end(r),s},request.post=function(t,e,r){var s=request("POST",t);return"function"==typeof e&&(r=e,e=null),e&&s.send(e),r&&s.end(r),s},request.put=function(t,e,r){var s=request("PUT",t);return"function"==typeof e&&(r=e,e=null),e&&s.send(e),r&&s.end(r),s},module.exports=request;


},{"emitter":15,"reduce":16}],15:[function(require,module,exports){
function Emitter(t){return t?mixin(t):void 0}function mixin(t){for(var e in Emitter.prototype)t[e]=Emitter.prototype[e];return t}module.exports=Emitter,Emitter.prototype.on=Emitter.prototype.addEventListener=function(t,e){return this._callbacks=this._callbacks||{},(this._callbacks[t]=this._callbacks[t]||[]).push(e),this},Emitter.prototype.once=function(t,e){function i(){r.off(t,i),e.apply(this,arguments)}var r=this;return this._callbacks=this._callbacks||{},i.fn=e,this.on(t,i),this},Emitter.prototype.off=Emitter.prototype.removeListener=Emitter.prototype.removeAllListeners=Emitter.prototype.removeEventListener=function(t,e){if(this._callbacks=this._callbacks||{},0==arguments.length)return this._callbacks={},this;var i=this._callbacks[t];if(!i)return this;if(1==arguments.length)return delete this._callbacks[t],this;for(var r,s=0;s<i.length;s++)if(r=i[s],r===e||r.fn===e){i.splice(s,1);break}return this},Emitter.prototype.emit=function(t){this._callbacks=this._callbacks||{};var e=[].slice.call(arguments,1),i=this._callbacks[t];if(i){i=i.slice(0);for(var r=0,s=i.length;s>r;++r)i[r].apply(this,e)}return this},Emitter.prototype.listeners=function(t){return this._callbacks=this._callbacks||{},this._callbacks[t]||[]},Emitter.prototype.hasListeners=function(t){return!!this.listeners(t).length};


},{}],16:[function(require,module,exports){
module.exports=function(l,n,e){for(var r=0,t=l.length,u=3==arguments.length?e:l[r++];t>r;)u=n.call(null,u,l[r],++r,l);return u};


},{}],17:[function(require,module,exports){
function convert(e,t){if("object"!=typeof e)throw new Error("resourceListing must be an object");Array.isArray(t)||(t=[]);var r={},n={},i={swagger:"2.0",info:buildInfo(e),paths:{}};return e.authorizations&&(i.securityDefinitions=buildSecurityDefinitions(e,r)),e.basePath&&assignPathComponents(e.basePath,i),extend(n,e.models),Array.isArray(e.apis)&&e.apis.forEach(function(t){Array.isArray(t.operations)&&(i.paths[t.path]=buildPath(t,e))}),t.forEach(function(e){e.basePath&&assignPathComponents(e.basePath,i),Array.isArray(e.apis)&&(e.apis.forEach(function(t){i.paths[t.path]=buildPath(t,e)}),Object.keys(e.models).length&&extend(n,transformAllModels(e.models)))}),Object.keys(n).length&&(i.definitions=transformAllModels(n)),i}function buildInfo(e){var t={version:e.apiVersion,title:"Title was not specified"};return"object"==typeof e.info&&(e.info.title&&(t.title=e.info.title),e.info.description&&(t.description=e.info.description),e.info.contact&&(t.contact={email:e.info.contact}),e.info.license&&(t.license={name:e.info.license,url:e.info.licenseUrl}),e.info.termsOfServiceUrl&&(t.termsOfService=e.info.termsOfServiceUrl)),t}function assignPathComponents(e,t){var r=urlParse(e);t.host=r.host,t.basePath=r.path,t.schemes=[r.protocol.substr(0,r.protocol.length-1)]}function processDataType(e){return e=clone(e),e.$ref&&-1===e.$ref.indexOf("#/definitions/")?e.$ref="#/definitions/"+e.$ref:e.items&&e.items.$ref&&-1===e.items.$ref.indexOf("#/definitions/")&&(e.items.$ref="#/definitions/"+e.items.$ref),"integer"===e.type?(e.minimum&&(e.minimum=parseInt(e.minimum,10)),e.maximum&&(e.maximum=parseInt(e.maximum,10))):(e.minimum&&(e.minimum=parseFloat(e.minimum)),e.maximum&&(e.maximum=parseFloat(e.maximum))),e.defaultValue&&(e["default"]="integer"===e.type?parseInt(e.defaultValue,10):"number"===e.type?parseFloat(e.defaultValue):e.defaultValue,delete e.defaultValue),e}function buildPath(e,t){var r={};return e.operations.forEach(function(e){var n=e.method.toLowerCase();r[n]=buildOperation(e,t.produces,t.consumes)}),r}function buildOperation(e,t,r){var n={responses:{},description:e.description||""};return e.summary&&(n.summary=e.summary),e.nickname&&(n.operationId=e.nickname),t&&(n.produces=t),r&&(n.consumes=r),Array.isArray(e.parameters)&&e.parameters.length&&(n.parameters=e.parameters.map(function(e){return buildParameter(processDataType(e))})),Array.isArray(e.responseMessages)&&e.responseMessages.forEach(function(e){n.responses[e.code]=buildResponse(e)}),Object.keys(n.responses).length||(n.responses={200:{description:"No response was specified"}}),n}function buildResponse(e){var t={};return t.description=e.message,t}function buildParameter(e){var t={"in":e.paramType,description:e.description,name:e.name,required:!!e.required},r=["string","number","boolean","integer","array","void","File"],n=["default","maximum","minimum","items"];return-1===r.indexOf(e.type)?t.schema={$ref:"#/definitions/"+e.type}:(t.type=e.type.toLowerCase(),n.forEach(function(r){"undefined"!=typeof e[r]&&(t[r]=e[r])}),"undefined"!=typeof e.defaultValue&&(t["default"]=e.defaultValue)),"form"===t["in"]&&(t["in"]="formData"),t}function buildSecurityDefinitions(e,t){var r={};return Object.keys(e.authorizations).forEach(function(n){var i=e.authorizations[n],o=function(e){var t=r[e||n]={type:i.type};return i.passAs&&(t["in"]=i.passAs),i.keyname&&(t.name=i.keyname),t};i.grantTypes?(t[n]=[],Object.keys(i.grantTypes).forEach(function(e){var r=i.grantTypes[e],s=n+"_"+e,a=o(s);switch(t[n].push(s),a.flow="implicit"===e?"implicit":"accessCode",e){case"implicit":a.authorizationUrl=r.loginEndpoint.url;break;case"authorization_code":a.authorizationUrl=r.tokenRequestEndpoint.url,a.tokenUrl=r.tokenEndpoint.url}i.scopes&&(a.scopes={},i.scopes.forEach(function(e){a.scopes[e.scope]=e.description||"Undescribed "+e.scope}))})):o()}),r}function transformModel(e){"object"==typeof e.properties&&Object.keys(e.properties).forEach(function(t){e.properties[t]=processDataType(e.properties[t])})}function transformAllModels(e){var t=clone(e);if("object"!=typeof e)throw new Error("models must be object");var r={};return Object.keys(t).forEach(function(e){var n=t[e];transformModel(n),n.subTypes&&(r[e]=n.subTypes,delete n.subTypes)}),Object.keys(r).forEach(function(e){r[e].forEach(function(r){var n=t[r];n&&(n.allOf=(n.allOf||[]).concat({$ref:"#/definitions/"+e}))})}),t}function extend(e,t){if("object"!=typeof e)throw new Error("source must be objects");"object"==typeof t&&Object.keys(t).forEach(function(r){e[r]=t[r]})}var urlParse=require("url").parse,clone=require("lodash.clonedeep");"undefined"==typeof window?module.exports=convert:window.SwaggerConverter=window.SwaggerConverter||{convert:convert};


},{"lodash.clonedeep":18,"url":10}],18:[function(require,module,exports){
function cloneDeep(e,a,l){return baseClone(e,!0,"function"==typeof a&&baseCreateCallback(a,l,1))}var baseClone=require("lodash._baseclone"),baseCreateCallback=require("lodash._basecreatecallback");module.exports=cloneDeep;


},{"lodash._baseclone":19,"lodash._basecreatecallback":41}],19:[function(require,module,exports){
function baseClone(s,e,a,r,l){if(a){var o=a(s);if("undefined"!=typeof o)return o}var t=isObject(s);if(!t)return s;var n=toString.call(s);if(!cloneableClasses[n])return s;var c=ctorByClass[n];switch(n){case boolClass:case dateClass:return new c(+s);case numberClass:case stringClass:return new c(s);case regexpClass:return o=c(s.source,reFlags.exec(s)),o.lastIndex=s.lastIndex,o}var C=isArray(s);if(e){var i=!r;r||(r=getArray()),l||(l=getArray());for(var b=r.length;b--;)if(r[b]==s)return l[b];o=C?c(s.length):{}}else o=C?slice(s):assign({},s);return C&&(hasOwnProperty.call(s,"index")&&(o.index=s.index),hasOwnProperty.call(s,"input")&&(o.input=s.input)),e?(r.push(s),l.push(o),(C?forEach:forOwn)(s,function(s,t){o[t]=baseClone(s,e,a,r,l)}),i&&(releaseArray(r),releaseArray(l)),o):o}var assign=require("lodash.assign"),forEach=require("lodash.foreach"),forOwn=require("lodash.forown"),getArray=require("lodash._getarray"),isArray=require("lodash.isarray"),isObject=require("lodash.isobject"),releaseArray=require("lodash._releasearray"),slice=require("lodash._slice"),reFlags=/\w*$/,argsClass="[object Arguments]",arrayClass="[object Array]",boolClass="[object Boolean]",dateClass="[object Date]",funcClass="[object Function]",numberClass="[object Number]",objectClass="[object Object]",regexpClass="[object RegExp]",stringClass="[object String]",cloneableClasses={};cloneableClasses[funcClass]=!1,cloneableClasses[argsClass]=cloneableClasses[arrayClass]=cloneableClasses[boolClass]=cloneableClasses[dateClass]=cloneableClasses[numberClass]=cloneableClasses[objectClass]=cloneableClasses[regexpClass]=cloneableClasses[stringClass]=!0;var objectProto=Object.prototype,toString=objectProto.toString,hasOwnProperty=objectProto.hasOwnProperty,ctorByClass={};ctorByClass[arrayClass]=Array,ctorByClass[boolClass]=Boolean,ctorByClass[dateClass]=Date,ctorByClass[funcClass]=Function,ctorByClass[objectClass]=Object,ctorByClass[numberClass]=Number,ctorByClass[regexpClass]=RegExp,ctorByClass[stringClass]=String,module.exports=baseClone;


},{"lodash._getarray":20,"lodash._releasearray":22,"lodash._slice":25,"lodash.assign":26,"lodash.foreach":31,"lodash.forown":32,"lodash.isarray":37,"lodash.isobject":39}],20:[function(require,module,exports){
function getArray(){return arrayPool.pop()||[]}var arrayPool=require("lodash._arraypool");module.exports=getArray;


},{"lodash._arraypool":21}],21:[function(require,module,exports){
var arrayPool=[];module.exports=arrayPool;


},{}],22:[function(require,module,exports){
function releaseArray(r){r.length=0,arrayPool.length<maxPoolSize&&arrayPool.push(r)}var arrayPool=require("lodash._arraypool"),maxPoolSize=require("lodash._maxpoolsize");module.exports=releaseArray;


},{"lodash._arraypool":23,"lodash._maxpoolsize":24}],23:[function(require,module,exports){
var arrayPool=[];module.exports=arrayPool;


},{}],24:[function(require,module,exports){
var maxPoolSize=40;module.exports=maxPoolSize;


},{}],25:[function(require,module,exports){
function slice(e,r,n){r||(r=0),"undefined"==typeof n&&(n=e?e.length:0);for(var o=-1,t=n-r||0,f=Array(0>t?0:t);++o<t;)f[o]=e[r+o];return f}module.exports=slice;


},{}],26:[function(require,module,exports){
var baseCreateCallback=require("lodash._basecreatecallback"),keys=require("lodash.keys"),objectTypes=require("lodash._objecttypes"),assign=function(e,a,r){var t,s=e,o=s;if(!s)return o;var n=arguments,f=0,l="number"==typeof r?2:n.length;if(l>3&&"function"==typeof n[l-2])var c=baseCreateCallback(n[--l-1],n[l--],2);else l>2&&"function"==typeof n[l-1]&&(c=n[--l]);for(;++f<l;)if(s=n[f],s&&objectTypes[typeof s])for(var y=-1,b=objectTypes[typeof s]&&keys(s),i=b?b.length:0;++y<i;)t=b[y],o[t]=c?c(o[t],s[t]):s[t];return o};module.exports=assign;


},{"lodash._basecreatecallback":41,"lodash._objecttypes":27,"lodash.keys":28}],27:[function(require,module,exports){
var objectTypes={"boolean":!1,"function":!0,object:!0,number:!1,string:!1,undefined:!1};module.exports=objectTypes;


},{}],28:[function(require,module,exports){
var isNative=require("lodash._isnative"),isObject=require("lodash.isobject"),shimKeys=require("lodash._shimkeys"),nativeKeys=isNative(nativeKeys=Object.keys)&&nativeKeys,keys=nativeKeys?function(e){return isObject(e)?nativeKeys(e):[]}:shimKeys;module.exports=keys;


},{"lodash._isnative":29,"lodash._shimkeys":30,"lodash.isobject":39}],29:[function(require,module,exports){
function isNative(t){return"function"==typeof t&&reNative.test(t)}var objectProto=Object.prototype,toString=objectProto.toString,reNative=RegExp("^"+String(toString).replace(/[.*+?^${}()|[\]\\]/g,"\\$&").replace(/toString| for [^\]]+/g,".*?")+"$");module.exports=isNative;


},{}],30:[function(require,module,exports){
var objectTypes=require("lodash._objecttypes"),objectProto=Object.prototype,hasOwnProperty=objectProto.hasOwnProperty,shimKeys=function(e){var r,o=e,t=[];if(!o)return t;if(!objectTypes[typeof e])return t;for(r in o)hasOwnProperty.call(o,r)&&t.push(r);return t};module.exports=shimKeys;


},{"lodash._objecttypes":27}],31:[function(require,module,exports){
function forEach(e,r,a){var o=-1,f=e?e.length:0;if(r=r&&"undefined"==typeof a?r:baseCreateCallback(r,a,3),"number"==typeof f)for(;++o<f&&r(e[o],o,e)!==!1;);else forOwn(e,r);return e}var baseCreateCallback=require("lodash._basecreatecallback"),forOwn=require("lodash.forown");module.exports=forEach;


},{"lodash._basecreatecallback":41,"lodash.forown":32}],32:[function(require,module,exports){
var baseCreateCallback=require("lodash._basecreatecallback"),keys=require("lodash.keys"),objectTypes=require("lodash._objecttypes"),forOwn=function(e,r,a){var t,o=e,s=o;if(!o)return s;if(!objectTypes[typeof o])return s;r=r&&"undefined"==typeof a?r:baseCreateCallback(r,a,3);for(var f=-1,l=objectTypes[typeof o]&&keys(o),n=l?l.length:0;++f<n;)if(t=l[f],r(o[t],t,e)===!1)return s;return s};module.exports=forOwn;


},{"lodash._basecreatecallback":41,"lodash._objecttypes":33,"lodash.keys":34}],33:[function(require,module,exports){
var objectTypes={"boolean":!1,"function":!0,object:!0,number:!1,string:!1,undefined:!1};module.exports=objectTypes;


},{}],34:[function(require,module,exports){
var isNative=require("lodash._isnative"),isObject=require("lodash.isobject"),shimKeys=require("lodash._shimkeys"),nativeKeys=isNative(nativeKeys=Object.keys)&&nativeKeys,keys=nativeKeys?function(e){return isObject(e)?nativeKeys(e):[]}:shimKeys;module.exports=keys;


},{"lodash._isnative":35,"lodash._shimkeys":36,"lodash.isobject":39}],35:[function(require,module,exports){
function isNative(t){return"function"==typeof t&&reNative.test(t)}var objectProto=Object.prototype,toString=objectProto.toString,reNative=RegExp("^"+String(toString).replace(/[.*+?^${}()|[\]\\]/g,"\\$&").replace(/toString| for [^\]]+/g,".*?")+"$");module.exports=isNative;


},{}],36:[function(require,module,exports){
var objectTypes=require("lodash._objecttypes"),objectProto=Object.prototype,hasOwnProperty=objectProto.hasOwnProperty,shimKeys=function(e){var r,o=e,t=[];if(!o)return t;if(!objectTypes[typeof e])return t;for(r in o)hasOwnProperty.call(o,r)&&t.push(r);return t};module.exports=shimKeys;


},{"lodash._objecttypes":33}],37:[function(require,module,exports){
var isNative=require("lodash._isnative"),arrayClass="[object Array]",objectProto=Object.prototype,toString=objectProto.toString,nativeIsArray=isNative(nativeIsArray=Array.isArray)&&nativeIsArray,isArray=nativeIsArray||function(r){return r&&"object"==typeof r&&"number"==typeof r.length&&toString.call(r)==arrayClass||!1};module.exports=isArray;


},{"lodash._isnative":38}],38:[function(require,module,exports){
function isNative(t){return"function"==typeof t&&reNative.test(t)}var objectProto=Object.prototype,toString=objectProto.toString,reNative=RegExp("^"+String(toString).replace(/[.*+?^${}()|[\]\\]/g,"\\$&").replace(/toString| for [^\]]+/g,".*?")+"$");module.exports=isNative;


},{}],39:[function(require,module,exports){
function isObject(e){return!(!e||!objectTypes[typeof e])}var objectTypes=require("lodash._objecttypes");module.exports=isObject;


},{"lodash._objecttypes":40}],40:[function(require,module,exports){
var objectTypes={"boolean":!1,"function":!0,object:!0,number:!1,string:!1,undefined:!1};module.exports=objectTypes;


},{}],41:[function(require,module,exports){
function baseCreateCallback(e,t,n){if("function"!=typeof e)return identity;if("undefined"==typeof t||!("prototype"in e))return e;var r=e.__bindData__;if("undefined"==typeof r&&(support.funcNames&&(r=!e.name),r=r||!support.funcDecomp,!r)){var i=fnToString.call(e);support.funcNames||(r=!reFuncName.test(i)),r||(r=reThis.test(i),setBindData(e,r))}if(r===!1||r!==!0&&1&r[1])return e;switch(n){case 1:return function(n){return e.call(t,n)};case 2:return function(n,r){return e.call(t,n,r)};case 3:return function(n,r,i){return e.call(t,n,r,i)};case 4:return function(n,r,i,a){return e.call(t,n,r,i,a)}}return bind(e,t)}var bind=require("lodash.bind"),identity=require("lodash.identity"),setBindData=require("lodash._setbinddata"),support=require("lodash.support"),reFuncName=/^\s*function[ \n\r\t]+\w/,reThis=/\bthis\b/,fnToString=Function.prototype.toString;module.exports=baseCreateCallback;


},{"lodash._setbinddata":42,"lodash.bind":45,"lodash.identity":61,"lodash.support":62}],42:[function(require,module,exports){
var isNative=require("lodash._isnative"),noop=require("lodash.noop"),descriptor={configurable:!1,enumerable:!1,value:null,writable:!1},defineProperty=function(){try{var e={},r=isNative(r=Object.defineProperty)&&r,t=r(e,e,e)&&r}catch(i){}return t}(),setBindData=defineProperty?function(e,r){descriptor.value=r,defineProperty(e,"__bindData__",descriptor)}:noop;module.exports=setBindData;


},{"lodash._isnative":43,"lodash.noop":44}],43:[function(require,module,exports){
function isNative(t){return"function"==typeof t&&reNative.test(t)}var objectProto=Object.prototype,toString=objectProto.toString,reNative=RegExp("^"+String(toString).replace(/[.*+?^${}()|[\]\\]/g,"\\$&").replace(/toString| for [^\]]+/g,".*?")+"$");module.exports=isNative;


},{}],44:[function(require,module,exports){
function noop(){}module.exports=noop;


},{}],45:[function(require,module,exports){
function bind(e,r){return arguments.length>2?createWrapper(e,17,slice(arguments,2),null,r):createWrapper(e,1,null,null,r)}var createWrapper=require("lodash._createwrapper"),slice=require("lodash._slice");module.exports=bind;


},{"lodash._createwrapper":46,"lodash._slice":60}],46:[function(require,module,exports){
function createWrapper(e,r,a,i,s,p){var n=1&r,t=2&r,u=4&r,l=16&r,c=32&r;if(!t&&!isFunction(e))throw new TypeError;l&&!a.length&&(r&=-17,l=a=!1),c&&!i.length&&(r&=-33,c=i=!1);var h=e&&e.__bindData__;if(h&&h!==!0)return h=slice(h),h[2]&&(h[2]=slice(h[2])),h[3]&&(h[3]=slice(h[3])),!n||1&h[1]||(h[4]=s),!n&&1&h[1]&&(r|=8),!u||4&h[1]||(h[5]=p),l&&push.apply(h[2]||(h[2]=[]),a),c&&unshift.apply(h[3]||(h[3]=[]),i),h[1]|=r,createWrapper.apply(null,h);var o=1==r||17===r?baseBind:baseCreateWrapper;return o([e,r,a,i,s,p])}var baseBind=require("lodash._basebind"),baseCreateWrapper=require("lodash._basecreatewrapper"),isFunction=require("lodash.isfunction"),slice=require("lodash._slice"),arrayRef=[],push=arrayRef.push,unshift=arrayRef.unshift;module.exports=createWrapper;


},{"lodash._basebind":47,"lodash._basecreatewrapper":53,"lodash._slice":60,"lodash.isfunction":59}],47:[function(require,module,exports){
function baseBind(e){function a(){if(s){var e=slice(s);push.apply(e,arguments)}if(this instanceof a){var i=baseCreate(r.prototype),n=r.apply(i,e||arguments);return isObject(n)?n:i}return r.apply(t,e||arguments)}var r=e[0],s=e[2],t=e[4];return setBindData(a,e),a}var baseCreate=require("lodash._basecreate"),isObject=require("lodash.isobject"),setBindData=require("lodash._setbinddata"),slice=require("lodash._slice"),arrayRef=[],push=arrayRef.push;module.exports=baseBind;


},{"lodash._basecreate":48,"lodash._setbinddata":42,"lodash._slice":60,"lodash.isobject":51}],48:[function(require,module,exports){
(function (global){
function baseCreate(e){return isObject(e)?nativeCreate(e):{}}var isNative=require("lodash._isnative"),isObject=require("lodash.isobject"),noop=require("lodash.noop"),nativeCreate=isNative(nativeCreate=Object.create)&&nativeCreate;nativeCreate||(baseCreate=function(){function e(){}return function(t){if(isObject(t)){e.prototype=t;var a=new e;e.prototype=null}return a||global.Object()}}()),module.exports=baseCreate;


}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"lodash._isnative":49,"lodash.isobject":51,"lodash.noop":50}],49:[function(require,module,exports){
function isNative(t){return"function"==typeof t&&reNative.test(t)}var objectProto=Object.prototype,toString=objectProto.toString,reNative=RegExp("^"+String(toString).replace(/[.*+?^${}()|[\]\\]/g,"\\$&").replace(/toString| for [^\]]+/g,".*?")+"$");module.exports=isNative;


},{}],50:[function(require,module,exports){
function noop(){}module.exports=noop;


},{}],51:[function(require,module,exports){
function isObject(e){return!(!e||!objectTypes[typeof e])}var objectTypes=require("lodash._objecttypes");module.exports=isObject;


},{"lodash._objecttypes":52}],52:[function(require,module,exports){
var objectTypes={"boolean":!1,"function":!0,object:!0,number:!1,string:!1,undefined:!1};module.exports=objectTypes;


},{}],53:[function(require,module,exports){
function baseCreateWrapper(e){function a(){var e=n?p:this;if(t){var b=slice(t);push.apply(b,arguments)}if((i||o)&&(b||(b=slice(arguments)),i&&push.apply(b,i),o&&b.length<u))return s|=16,baseCreateWrapper([r,c?s:-4&s,b,null,p,u]);if(b||(b=arguments),l&&(r=e[h]),this instanceof a){e=baseCreate(r.prototype);var d=r.apply(e,b);return isObject(d)?d:e}return r.apply(e,b)}var r=e[0],s=e[1],t=e[2],i=e[3],p=e[4],u=e[5],n=1&s,l=2&s,o=4&s,c=8&s,h=r;return setBindData(a,e),a}var baseCreate=require("lodash._basecreate"),isObject=require("lodash.isobject"),setBindData=require("lodash._setbinddata"),slice=require("lodash._slice"),arrayRef=[],push=arrayRef.push;module.exports=baseCreateWrapper;


},{"lodash._basecreate":54,"lodash._setbinddata":42,"lodash._slice":60,"lodash.isobject":57}],54:[function(require,module,exports){
(function (global){
function baseCreate(e){return isObject(e)?nativeCreate(e):{}}var isNative=require("lodash._isnative"),isObject=require("lodash.isobject"),noop=require("lodash.noop"),nativeCreate=isNative(nativeCreate=Object.create)&&nativeCreate;nativeCreate||(baseCreate=function(){function e(){}return function(t){if(isObject(t)){e.prototype=t;var a=new e;e.prototype=null}return a||global.Object()}}()),module.exports=baseCreate;


}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"lodash._isnative":55,"lodash.isobject":57,"lodash.noop":56}],55:[function(require,module,exports){
function isNative(t){return"function"==typeof t&&reNative.test(t)}var objectProto=Object.prototype,toString=objectProto.toString,reNative=RegExp("^"+String(toString).replace(/[.*+?^${}()|[\]\\]/g,"\\$&").replace(/toString| for [^\]]+/g,".*?")+"$");module.exports=isNative;


},{}],56:[function(require,module,exports){
function noop(){}module.exports=noop;


},{}],57:[function(require,module,exports){
function isObject(e){return!(!e||!objectTypes[typeof e])}var objectTypes=require("lodash._objecttypes");module.exports=isObject;


},{"lodash._objecttypes":58}],58:[function(require,module,exports){
var objectTypes={"boolean":!1,"function":!0,object:!0,number:!1,string:!1,undefined:!1};module.exports=objectTypes;


},{}],59:[function(require,module,exports){
function isFunction(n){return"function"==typeof n}module.exports=isFunction;


},{}],60:[function(require,module,exports){
function slice(e,r,n){r||(r=0),"undefined"==typeof n&&(n=e?e.length:0);for(var o=-1,t=n-r||0,f=Array(0>t?0:t);++o<t;)f[o]=e[r+o];return f}module.exports=slice;


},{}],61:[function(require,module,exports){
function identity(t){return t}module.exports=identity;


},{}],62:[function(require,module,exports){
(function (global){
var isNative=require("lodash._isnative"),reThis=/\bthis\b/,support={};support.funcDecomp=!isNative(global.WinRTError)&&reThis.test(function(){return this}),support.funcNames="string"==typeof Function.name,module.exports=support;


}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"lodash._isnative":63}],63:[function(require,module,exports){
function isNative(t){return"function"==typeof t&&reNative.test(t)}var objectProto=Object.prototype,toString=objectProto.toString,reNative=RegExp("^"+String(toString).replace(/[.*+?^${}()|[\]\\]/g,"\\$&").replace(/toString| for [^\]]+/g,".*?")+"$");module.exports=isNative;


},{}],64:[function(require,module,exports){
function Traverse(e){this.value=e}function walk(e,t,r){var o=[],n=[],a=!0;return function i(e){function c(){if("object"==typeof l.node&&null!==l.node){l.keys&&l.node_===l.node||(l.keys=objectKeys(l.node)),l.isLeaf=0==l.keys.length;for(var t=0;t<n.length;t++)if(n[t].node_===e){l.circular=n[t];break}}else l.isLeaf=!0,l.keys=null;l.notLeaf=!l.isLeaf,l.notRoot=!l.isRoot}var s=r?copy(e):e,u={},f=!0,l={node:s,node_:e,path:[].concat(o),parent:n[n.length-1],parents:n,key:o.slice(-1)[0],isRoot:0===o.length,level:o.length,circular:null,update:function(e,t){l.isRoot||(l.parent.node[l.key]=e),l.node=e,t&&(f=!1)},"delete":function(e){delete l.parent.node[l.key],e&&(f=!1)},remove:function(e){isArray(l.parent.node)?l.parent.node.splice(l.key,1):delete l.parent.node[l.key],e&&(f=!1)},keys:null,before:function(e){u.before=e},after:function(e){u.after=e},pre:function(e){u.pre=e},post:function(e){u.post=e},stop:function(){a=!1},block:function(){f=!1}};if(!a)return l;c();var p=t.call(l,l.node);return void 0!==p&&l.update&&l.update(p),u.before&&u.before.call(l,l.node),f?("object"!=typeof l.node||null===l.node||l.circular||(n.push(l),c(),forEach(l.keys,function(e,t){o.push(e),u.pre&&u.pre.call(l,l.node[e],e);var n=i(l.node[e]);r&&hasOwnProperty.call(l.node,e)&&(l.node[e]=n.node),n.isLast=t==l.keys.length-1,n.isFirst=0==t,u.post&&u.post.call(l,n),o.pop()}),n.pop()),u.after&&u.after.call(l,l.node),l):l}(e).node}function copy(e){if("object"==typeof e&&null!==e){var t;if(isArray(e))t=[];else if(isDate(e))t=new Date(e.getTime?e.getTime():e);else if(isRegExp(e))t=new RegExp(e);else if(isError(e))t={message:e.message};else if(isBoolean(e))t=new Boolean(e);else if(isNumber(e))t=new Number(e);else if(isString(e))t=new String(e);else if(Object.create&&Object.getPrototypeOf)t=Object.create(Object.getPrototypeOf(e));else if(e.constructor===Object)t={};else{var r=e.constructor&&e.constructor.prototype||e.__proto__||{},o=function(){};o.prototype=r,t=new o}return forEach(objectKeys(e),function(r){t[r]=e[r]}),t}return e}function toS(e){return Object.prototype.toString.call(e)}function isDate(e){return"[object Date]"===toS(e)}function isRegExp(e){return"[object RegExp]"===toS(e)}function isError(e){return"[object Error]"===toS(e)}function isBoolean(e){return"[object Boolean]"===toS(e)}function isNumber(e){return"[object Number]"===toS(e)}function isString(e){return"[object String]"===toS(e)}var traverse=module.exports=function(e){return new Traverse(e)};Traverse.prototype.get=function(e){for(var t=this.value,r=0;r<e.length;r++){var o=e[r];if(!t||!hasOwnProperty.call(t,o)){t=void 0;break}t=t[o]}return t},Traverse.prototype.has=function(e){for(var t=this.value,r=0;r<e.length;r++){var o=e[r];if(!t||!hasOwnProperty.call(t,o))return!1;t=t[o]}return!0},Traverse.prototype.set=function(e,t){for(var r=this.value,o=0;o<e.length-1;o++){var n=e[o];hasOwnProperty.call(r,n)||(r[n]={}),r=r[n]}return r[e[o]]=t,t},Traverse.prototype.map=function(e){return walk(this.value,e,!0)},Traverse.prototype.forEach=function(e){return this.value=walk(this.value,e,!1),this.value},Traverse.prototype.reduce=function(e,t){var r=1===arguments.length,o=r?this.value:t;return this.forEach(function(t){this.isRoot&&r||(o=e.call(this,o,t))}),o},Traverse.prototype.paths=function(){var e=[];return this.forEach(function(){e.push(this.path)}),e},Traverse.prototype.nodes=function(){var e=[];return this.forEach(function(){e.push(this.node)}),e},Traverse.prototype.clone=function(){var e=[],t=[];return function r(o){for(var n=0;n<e.length;n++)if(e[n]===o)return t[n];if("object"==typeof o&&null!==o){var a=copy(o);return e.push(o),t.push(a),forEach(objectKeys(o),function(e){a[e]=r(o[e])}),e.pop(),t.pop(),a}return o}(this.value)};var objectKeys=Object.keys||function(e){var t=[];for(var r in e)t.push(r);return t},isArray=Array.isArray||function(e){return"[object Array]"===Object.prototype.toString.call(e)},forEach=function(e,t){if(e.forEach)return e.forEach(t);for(var r=0;r<e.length;r++)t(e[r],r,e)};forEach(objectKeys(Traverse.prototype),function(e){traverse[e]=function(t){var r=[].slice.call(arguments,1),o=new Traverse(t);return o[e].apply(o,r)}});var hasOwnProperty=Object.hasOwnProperty||function(e,t){return t in e};


},{}],65:[function(require,module,exports){
"use strict";module.exports={INVALID_TYPE:"Expected type {0} but found type {1}",INVALID_FORMAT:"Object didn't pass validation for format {0}: {1}",ENUM_MISMATCH:"No enum match for: {0}",ANY_OF_MISSING:"Data does not match any schemas from 'anyOf'",ONE_OF_MISSING:"Data does not match any schemas from 'oneOf'",ONE_OF_MULTIPLE:"Data is valid against more than one schema from 'oneOf'",NOT_PASSED:"Data matches schema from 'not'",ARRAY_LENGTH_SHORT:"Array is too short ({0}), minimum {1}",ARRAY_LENGTH_LONG:"Array is too long ({0}), maximum {1}",ARRAY_UNIQUE:"Array items are not unique (indexes {0} and {1})",ARRAY_ADDITIONAL_ITEMS:"Additional items not allowed",MULTIPLE_OF:"Value {0} is not a multiple of {1}",MINIMUM:"Value {0} is less than minimum {1}",MINIMUM_EXCLUSIVE:"Value {0} is equal or less than exclusive minimum {1}",MAXIMUM:"Value {0} is greater than maximum {1}",MAXIMUM_EXCLUSIVE:"Value {0} is equal or greater than exclusive maximum {1}",OBJECT_PROPERTIES_MINIMUM:"Too few properties defined ({0}), minimum {1}",OBJECT_PROPERTIES_MAXIMUM:"Too many properties defined ({0}), maximum {1}",OBJECT_MISSING_REQUIRED_PROPERTY:"Missing required property: {0}",OBJECT_ADDITIONAL_PROPERTIES:"Additional properties not allowed: {0}",OBJECT_DEPENDENCY_KEY:"Dependency failed - key must exist: {0} (due to key: {1})",MIN_LENGTH:"String is too short ({0} chars), minimum {1}",MAX_LENGTH:"String is too long ({0} chars), maximum {1}",PATTERN:"String does not match pattern {0}: {1}",KEYWORD_TYPE_EXPECTED:"Keyword '{0}' is expected to be of type '{1}'",KEYWORD_UNDEFINED_STRICT:"Keyword '{0}' must be defined in strict mode",KEYWORD_UNEXPECTED:"Keyword '{0}' is not expected to appear in the schema",KEYWORD_MUST_BE:"Keyword '{0}' must be {1}",KEYWORD_DEPENDENCY:"Keyword '{0}' requires keyword '{1}'",KEYWORD_PATTERN:"Keyword '{0}' is not a valid RegExp pattern: {1}",KEYWORD_VALUE_TYPE:"Each element of keyword '{0}' array must be a '{1}'",UNKNOWN_FORMAT:"There is no validation function for format '{0}'",CUSTOM_MODE_FORCE_PROPERTIES:"{0} must define at least one property if present",REF_UNRESOLVED:"Reference has not been resolved during compilation: {0}",UNRESOLVABLE_REFERENCE:"Reference could not be resolved: {0}",SCHEMA_NOT_REACHABLE:"Validator was not able to read schema with uri: {0}",SCHEMA_TYPE_EXPECTED:"Schema is expected to be of type 'object'",SCHEMA_NOT_AN_OBJECT:"Schema is not an object: {0}",ASYNC_TIMEOUT:"{0} asynchronous task(s) have timed out after {1} ms",PARENT_SCHEMA_VALIDATION_FAILED:"Schema failed to validate against its parent schema, see inner errors for details.",REMOTE_NOT_VALID:"Remote reference didn't compile successfully: {0}"};


},{}],66:[function(require,module,exports){
var FormatValidators={date:function(t){if("string"!=typeof t)return!0;var d=/^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(t);return null===d?!1:d[2]<"01"||d[2]>"12"||d[3]<"01"||d[3]>"31"?!1:!0},"date-time":function(t){if("string"!=typeof t)return!0;var d=t.toLowerCase().split("t");if(!FormatValidators.date(d[0]))return!1;var a=/^([0-9]{2}):([0-9]{2}):([0-9]{2})(.[0-9]+)?(z|([+-][0-9]{2}:[0-9]{2}))$/.exec(d[1]);return null===a?!1:a[1]>"23"||a[2]>"59"||a[3]>"59"?!1:!0},email:function(t){return"string"!=typeof t?!0:/^[a-zA-Z0-9+&*-]+(?:\.[a-zA-Z0-9_+&*-]+)*@(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,7}$/.test(t)},hostname:function(t){if("string"!=typeof t)return!0;var d=/^[a-zA-Z](([-0-9a-zA-Z]+)?[0-9a-zA-Z])?(\.[a-zA-Z](([-0-9a-zA-Z]+)?[0-9a-zA-Z])?)*$/.test(t);if(d){if(t.length>255)return!1;for(var a=t.split("."),r=0;r<a.length;r++)if(a[r].length>63)return!1}return d},"host-name":function(t){return FormatValidators.hostname.call(this,t)},ipv4:function(t){return"string"!=typeof t?!0:-1===t.indexOf(".")?!1:/^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(t)},ipv6:function(t){return"string"!=typeof t||/^\s*((([0-9A-Fa-f]{1,4}:){7}([0-9A-Fa-f]{1,4}|:))|(([0-9A-Fa-f]{1,4}:){6}(:[0-9A-Fa-f]{1,4}|((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9A-Fa-f]{1,4}:){5}(((:[0-9A-Fa-f]{1,4}){1,2})|:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9A-Fa-f]{1,4}:){4}(((:[0-9A-Fa-f]{1,4}){1,3})|((:[0-9A-Fa-f]{1,4})?:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9A-Fa-f]{1,4}:){3}(((:[0-9A-Fa-f]{1,4}){1,4})|((:[0-9A-Fa-f]{1,4}){0,2}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9A-Fa-f]{1,4}:){2}(((:[0-9A-Fa-f]{1,4}){1,5})|((:[0-9A-Fa-f]{1,4}){0,3}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9A-Fa-f]{1,4}:){1}(((:[0-9A-Fa-f]{1,4}){1,6})|((:[0-9A-Fa-f]{1,4}){0,4}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(:(((:[0-9A-Fa-f]{1,4}){1,7})|((:[0-9A-Fa-f]{1,4}){0,5}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:)))(%.+)?\s*$/.test(t)},regex:function(t){try{return RegExp(t),!0}catch(d){return!1}},uri:function(t){return this.options.strictUris?FormatValidators["strict-uri"].apply(this,arguments):"string"!=typeof t||RegExp("^(([^:/?#]+):)?(//([^/?#]*))?([^?#]*)(\\?([^#]*))?(#(.*))?").test(t)},"strict-uri":function(t){return"string"!=typeof t||RegExp("^(?:(?:https?|ftp)://)(?:\\S+(?::\\S*)?@)?(?:(?!10(?:\\.\\d{1,3}){3})(?!127(?:\\.\\d{1,3}){3})(?!169\\.254(?:\\.\\d{1,3}){2})(?!192\\.168(?:\\.\\d{1,3}){2})(?!172\\.(?:1[6-9]|2\\d|3[0-1])(?:\\.\\d{1,3}){2})(?:[1-9]\\d?|1\\d\\d|2[01]\\d|22[0-3])(?:\\.(?:1?\\d{1,2}|2[0-4]\\d|25[0-5])){2}(?:\\.(?:[1-9]\\d?|1\\d\\d|2[0-4]\\d|25[0-4]))|(?:(?:[a-z\\u00a1-\\uffff0-9]+-?)*[a-z\\u00a1-\\uffff0-9]+)(?:\\.(?:[a-z\\u00a1-\\uffff0-9]+-?)*[a-z\\u00a1-\\uffff0-9]+)*(?:\\.(?:[a-z\\u00a1-\\uffff]{2,})))(?::\\d{2,5})?(?:/[^\\s]*)?$","i").test(t)}};module.exports=FormatValidators;


},{}],67:[function(require,module,exports){
"use strict";var FormatValidators=require("./FormatValidators"),Report=require("./Report"),Utils=require("./Utils"),JsonValidators={multipleOf:function(r,e,t){"number"==typeof t&&"integer"!==Utils.whatIs(t/e.multipleOf)&&r.addError("MULTIPLE_OF",[t,e.multipleOf],null,e.description)},maximum:function(r,e,t){"number"==typeof t&&(e.exclusiveMaximum!==!0?t>e.maximum&&r.addError("MAXIMUM",[t,e.maximum],null,e.description):t>=e.maximum&&r.addError("MAXIMUM_EXCLUSIVE",[t,e.maximum],null,e.description))},exclusiveMaximum:function(){},minimum:function(r,e,t){"number"==typeof t&&(e.exclusiveMinimum!==!0?t<e.minimum&&r.addError("MINIMUM",[t,e.minimum],null,e.description):t<=e.minimum&&r.addError("MINIMUM_EXCLUSIVE",[t,e.minimum],null,e.description))},exclusiveMinimum:function(){},maxLength:function(r,e,t){"string"==typeof t&&t.length>e.maxLength&&r.addError("MAX_LENGTH",[t.length,e.maxLength],null,e.description)},minLength:function(r,e,t){"string"==typeof t&&t.length<e.minLength&&r.addError("MIN_LENGTH",[t.length,e.minLength],null,e.description)},pattern:function(r,e,t){"string"==typeof t&&RegExp(e.pattern).test(t)===!1&&r.addError("PATTERN",[e.pattern,t],null,e.description)},additionalItems:function(r,e,t){Array.isArray(t)&&e.additionalItems===!1&&Array.isArray(e.items)&&t.length>e.items.length&&r.addError("ARRAY_ADDITIONAL_ITEMS",null,null,e.description)},items:function(){},maxItems:function(r,e,t){Array.isArray(t)&&t.length>e.maxItems&&r.addError("ARRAY_LENGTH_LONG",[t.length,e.maxItems],null,e.description)},minItems:function(r,e,t){Array.isArray(t)&&t.length<e.minItems&&r.addError("ARRAY_LENGTH_SHORT",[t.length,e.minItems],null,e.description)},uniqueItems:function(r,e,t){if(Array.isArray(t)&&e.uniqueItems===!0){var i=[];Utils.isUniqueArray(t,i)===!1&&r.addError("ARRAY_UNIQUE",i,null,e.description)}},maxProperties:function(r,e,t){if("object"===Utils.whatIs(t)){var i=Object.keys(t).length;i>e.maxProperties&&r.addError("OBJECT_PROPERTIES_MAXIMUM",[i,e.maxProperties],null,e.description)}},minProperties:function(r,e,t){if("object"===Utils.whatIs(t)){var i=Object.keys(t).length;i<e.minProperties&&r.addError("OBJECT_PROPERTIES_MINIMUM",[i,e.minProperties],null,e.description)}},required:function(r,e,t){if("object"===Utils.whatIs(t))for(var i=e.required.length;i--;){var n=e.required[i];void 0===t[n]&&r.addError("OBJECT_MISSING_REQUIRED_PROPERTY",[n],null,e.description)}},additionalProperties:function(r,e,t){return void 0===e.properties&&void 0===e.patternProperties?JsonValidators.properties.call(this,r,e,t):void 0},patternProperties:function(r,e,t){return void 0===e.properties?JsonValidators.properties.call(this,r,e,t):void 0},properties:function(r,e,t){if("object"===Utils.whatIs(t)){var i=void 0!==e.properties?e.properties:{},n=void 0!==e.patternProperties?e.patternProperties:{};if(e.additionalProperties===!1){var o=Object.keys(t),a=Object.keys(i),s=Object.keys(n);o=Utils.difference(o,a);for(var l=s.length;l--;)for(var d=RegExp(s[l]),p=o.length;p--;)d.test(o[p])===!0&&o.splice(p,1);o.length>0&&r.addError("OBJECT_ADDITIONAL_PROPERTIES",[o],null,e.description)}}},dependencies:function(r,e,t){if("object"===Utils.whatIs(t))for(var i=Object.keys(e.dependencies),n=i.length;n--;){var o=i[n];if(t[o]){var a=e.dependencies[o];if("object"===Utils.whatIs(a))exports.validate.call(this,r,a,t);else for(var s=a.length;s--;){var l=a[s];void 0===t[l]&&r.addError("OBJECT_DEPENDENCY_KEY",[l,o],null,e.description)}}}},"enum":function(r,e,t){for(var i=!1,n=e["enum"].length;n--;)if(Utils.areEqual(t,e["enum"][n])){i=!0;break}i===!1&&r.addError("ENUM_MISMATCH",[t],null,e.description)},allOf:function(r,e,t){for(var i=e.allOf.length;i--&&exports.validate.call(this,r,e.allOf[i],t)!==!1;);},anyOf:function(r,e,t){for(var i=[],n=!1,o=e.anyOf.length;o--&&n===!1;){var a=new Report(r);i.push(a),n=exports.validate.call(this,a,e.anyOf[o],t)}n===!1&&r.addError("ANY_OF_MISSING",void 0,i,e.description)},oneOf:function(r,e,t){for(var i=0,n=[],o=e.oneOf.length;o--;){var a=new Report(r);n.push(a),exports.validate.call(this,a,e.oneOf[o],t)===!0&&i++}0===i?r.addError("ONE_OF_MISSING",void 0,n,e.description):i>1&&r.addError("ONE_OF_MULTIPLE",null,null,e.description)},not:function(r,e,t){var i=new Report(r);exports.validate.call(this,i,e.not,t)===!0&&r.addError("NOT_PASSED",null,null,e.description)},definitions:function(){},format:function(r,e,t){var i=FormatValidators[e.format];"function"==typeof i?2===i.length?r.addAsyncTask(i,[t],function(i){i!==!0&&r.addError("INVALID_FORMAT",[e.format,t],null,e.description)}):i.call(this,t)!==!0&&r.addError("INVALID_FORMAT",[e.format,t],null,e.description):r.addError("UNKNOWN_FORMAT",[e.format],null,e.description)}},recurseArray=function(r,e,t){var i=t.length;if(Array.isArray(e.items))for(;i--;)i<e.items.length?(r.path.push(i.toString()),exports.validate.call(this,r,e.items[i],t[i]),r.path.pop()):"object"==typeof e.additionalItems&&(r.path.push(i.toString()),exports.validate.call(this,r,e.additionalItems,t[i]),r.path.pop());else if("object"==typeof e.items)for(;i--;)r.path.push(i.toString()),exports.validate.call(this,r,e.items,t[i]),r.path.pop()},recurseObject=function(r,e,t){var i=e.additionalProperties;(i===!0||void 0===i)&&(i={});for(var n=e.properties?Object.keys(e.properties):[],o=e.patternProperties?Object.keys(e.patternProperties):[],a=Object.keys(t),s=a.length;s--;){var l=a[s],d=t[l],p=[];-1!==n.indexOf(l)&&p.push(e.properties[l]);for(var u=o.length;u--;){var c=o[u];RegExp(c).test(l)===!0&&p.push(e.patternProperties[c])}for(0===p.length&&i!==!1&&p.push(i),u=p.length;u--;)r.path.push(l),exports.validate.call(this,r,p[u],d),r.path.pop()}};exports.validate=function(r,e,t){r.commonErrorMessage="JSON_OBJECT_VALIDATION_FAILED";var i=Utils.whatIs(e);if("object"!==i)return r.addError("SCHEMA_NOT_AN_OBJECT",[i],null,e.description),!1;var n=Object.keys(e);if(0===n.length)return!0;var o=!1;if(r.rootSchema||(r.rootSchema=e,o=!0),void 0!==e.$ref){for(var a=99;e.$ref&&a>0;){if(!e.__$refResolved){r.addError("REF_UNRESOLVED",[e.$ref],null,e.description);break}if(e.__$refResolved===e)break;e=e.__$refResolved,n=Object.keys(e),a--}if(0===a)throw new Error("Circular dependency by $ref references!")}var s=Utils.whatIs(t);if(e.type)if("string"==typeof e.type){if(s!==e.type&&("integer"!==s||"number"!==e.type)&&(r.addError("INVALID_TYPE",[e.type,s],null,e.description),this.options.breakOnFirstError))return!1}else if(-1===e.type.indexOf(s)&&("integer"!==s||-1===e.type.indexOf("number"))&&(r.addError("INVALID_TYPE",[e.type,s],null,e.description),this.options.breakOnFirstError))return!1;for(var l=n.length;l--&&!(JsonValidators[n[l]]&&(JsonValidators[n[l]].call(this,r,e,t),r.errors.length&&this.options.breakOnFirstError)););return(0===r.errors.length||this.options.breakOnFirstError===!1)&&("array"===s?recurseArray.call(this,r,e,t):"object"===s&&recurseObject.call(this,r,e,t)),o&&(r.rootSchema=void 0),0===r.errors.length};


},{"./FormatValidators":66,"./Report":69,"./Utils":73}],68:[function(require,module,exports){
"function"!=typeof Number.isFinite&&(Number.isFinite=function(e){return"number"!=typeof e?!1:e!==e||1/0===e||e===-1/0?!1:!0});


},{}],69:[function(require,module,exports){
(function (process){
"use strict";function Report(r){this.parentReport=r instanceof Report?r:void 0,this.options=r instanceof Report?r.options:r||{},this.errors=[],this.path=[],this.asyncTasks=[]}var Errors=require("./Errors"),Utils=require("./Utils");Report.prototype.isValid=function(){if(this.asyncTasks.length>0)throw new Error("Async tasks pending, can't answer isValid");return 0===this.errors.length},Report.prototype.addAsyncTask=function(r,t,o){this.asyncTasks.push([r,t,o])},Report.prototype.processAsyncTasks=function(r,t){function o(){process.nextTick(function(){var r=0===p.errors.length,o=r?void 0:p.errors;t(o,r)})}function e(r){return function(t){a||(r(t),0===--n&&o())}}var s=r||2e3,n=this.asyncTasks.length,i=n,a=!1,p=this;if(0===n||this.errors.length>0)return void o();for(;i--;){var h=this.asyncTasks[i];h[0].apply(null,h[1].concat(e(h[2])))}setTimeout(function(){n>0&&(a=!0,p.addError("ASYNC_TIMEOUT",[n,s]),t(p.errors,!1))},s)},Report.prototype.getPath=function(){var r=[];return this.parentReport&&(r=r.concat(this.parentReport.path)),r=r.concat(this.path),this.options.reportPathAsArray!==!0&&(r="#/"+r.map(function(r){return r.replace("~","~0").replace("/","~1")}).join("/")),r},Report.prototype.addError=function(r,t,o,e){if(!r)throw new Error("No errorCode passed into addError()");if(!Errors[r])throw new Error("No errorMessage known for code "+r);t=t||[];for(var s=t.length,n=Errors[r];s--;){var i=Utils.whatIs(t[s]),a="object"===i||"null"===i?JSON.stringify(t[s]):t[s];n=n.replace("{"+s+"}",a)}var p={code:r,params:t,message:n,path:this.getPath()};if(e&&(p.description=e),null!=o){for(Array.isArray(o)||(o=[o]),p.inner=[],s=o.length;s--;)for(var h=o[s],c=h.errors.length;c--;)p.inner.push(h.errors[c]);0===p.inner.length&&(p.inner=void 0)}this.errors.push(p)},module.exports=Report;


}).call(this,require('_process'))
},{"./Errors":65,"./Utils":73,"_process":5}],70:[function(require,module,exports){
"use strict";function decodeJSONPointer(e){return decodeURIComponent(e).replace(/~[0-1]/g,function(e){return"~1"===e?"/":"~"})}function getRemotePath(e){var t=e.indexOf("#");return-1===t?e:e.slice(0,t)}function getQueryPath(e){var t=e.indexOf("#"),r=-1===t?void 0:e.slice(t+1);return r}function findId(e,t){if("object"==typeof e&&null!==e){if(!t)return e;if(e.id&&(e.id===t||"#"===e.id[0]&&e.id.substring(1)===t))return e;var r,i;if(Array.isArray(e)){for(r=e.length;r--;)if(i=findId(e[r],t))return i}else{var a=Object.keys(e);for(r=a.length;r--;){var n=a[r];if(0!==n.indexOf("__$")&&(i=findId(e[n],t)))return i}}}}var Report=require("./Report"),SchemaCompilation=require("./SchemaCompilation"),SchemaValidation=require("./SchemaValidation"),Utils=require("./Utils");exports.cacheSchemaByUri=function(e,t){var r=getRemotePath(e);r&&(this.cache[r]=t)},exports.removeFromCacheByUri=function(e){var t=getRemotePath(e);t&&(this.cache[t]=void 0)},exports.checkCacheForUri=function(e){var t=getRemotePath(e);return t?null!=this.cache[t]:!1},exports.getSchemaByReference=function(e){for(var t=this.referenceCache.length;t--;)if(this.referenceCache[t][0]===e)return this.referenceCache[t][1];var r=Utils.cloneDeep(e);return this.referenceCache.push([e,r]),r},exports.getSchemaByUri=function(e,t,r){var i=getRemotePath(t),a=getQueryPath(t),n=i?this.cache[i]:r;if(n&&i){var o=n!==r;if(o){e.path.push(i);var c=new Report(e);SchemaCompilation.compileSchema.call(this,c,n)&&SchemaValidation.validateSchema.call(this,c,n);var h=c.isValid();if(h||e.addError("REMOTE_NOT_VALID",[t],c),e.path.pop(),!h)return void 0}}if(n&&a)for(var f=a.split("/"),u=0,s=f.length;s>u;u++){var d=decodeJSONPointer(f[u]);n=0===u?findId(n,d):n[d]}return n},exports.getRemotePath=getRemotePath;


},{"./Report":69,"./SchemaCompilation":71,"./SchemaValidation":72,"./Utils":73}],71:[function(require,module,exports){
"use strict";function isAbsoluteUri(e){return/^https?:\/\//.test(e)}function isRelativeUri(e){return/.+#/.test(e)}function mergeReference(e,r){if(isAbsoluteUri(r))return r;var i,s=e.join(""),c=isAbsoluteUri(s),t=isRelativeUri(s),n=isRelativeUri(r);c&&n?(i=s.match(/\/[^\/]*$/),i&&(s=s.slice(0,i.index+1))):t&&n?s="":(i=s.match(/[^#/]+$/),i&&(s=s.slice(0,i.index)));var o=s+r;return o=o.replace(/##/,"#")}function collectReferences(e,r,i,s){if(r=r||[],i=i||[],s=s||[],"object"!=typeof e||null===e)return r;"string"==typeof e.id&&i.push(e.id),"string"==typeof e.$ref&&"undefined"==typeof e.__$refResolved&&r.push({ref:mergeReference(i,e.$ref),key:"$ref",obj:e,path:s.slice(0)}),"string"==typeof e.$schema&&"undefined"==typeof e.__$schemaResolved&&r.push({ref:mergeReference(i,e.$schema),key:"$schema",obj:e,path:s.slice(0)});var c;if(Array.isArray(e))for(c=e.length;c--;)s.push(c.toString()),collectReferences(e[c],r,i,s),s.pop();else{var t=Object.keys(e);for(c=t.length;c--;)0!==t[c].indexOf("__$")&&(s.push(t[c]),collectReferences(e[t[c]],r,i,s),s.pop())}return"string"==typeof e.id&&i.pop(),r}function findId(e,r){for(var i=e.length;i--;)if(e[i].id===r)return e[i];return null}var Report=require("./Report"),SchemaCache=require("./SchemaCache"),compileArrayOfSchemasLoop=function(e,r){for(var i=r.length,s=0;i--;){var c=new Report(e),t=exports.compileSchema.call(this,c,r[i]);t&&s++,e.errors=e.errors.concat(c.errors)}return s},compileArrayOfSchemas=function(e,r){var i,s=0;do{for(var c=e.errors.length;c--;)"UNRESOLVABLE_REFERENCE"===e.errors[c].code&&e.errors.splice(c,1);for(i=s,s=compileArrayOfSchemasLoop.call(this,e,r),c=r.length;c--;){var t=r[c];if(t.__$missingReferences){for(var n=t.__$missingReferences.length;n--;){var o=t.__$missingReferences[n],a=findId(r,o.ref);a&&(o.obj["__"+o.key+"Resolved"]=a,t.__$missingReferences.splice(n,1))}0===t.__$missingReferences.length&&delete t.__$missingReferences}}}while(s!==r.length&&s!==i);return e.isValid()};exports.compileSchema=function(e,r){if(e.commonErrorMessage="SCHEMA_COMPILATION_FAILED","string"==typeof r){var i=SchemaCache.getSchemaByUri.call(this,e,r);if(!i)return e.addError("SCHEMA_NOT_REACHABLE",[r]),!1;r=i}if(Array.isArray(r))return compileArrayOfSchemas.call(this,e,r);if(r.__$compiled&&r.id&&SchemaCache.checkCacheForUri.call(this,r.id)===!1&&(r.__$compiled=void 0),r.__$compiled)return!0;r.id&&SchemaCache.cacheSchemaByUri.call(this,r.id,r);var s=e.isValid();delete r.__$missingReferences;for(var c=collectReferences.call(this,r),t=c.length;t--;){var n=c[t],o=SchemaCache.getSchemaByUri.call(this,e,n.ref,r);o||isAbsoluteUri(n.ref)&&this.options.ignoreUnresolvableReferences===!0||(Array.prototype.push.apply(e.path,n.path),e.addError("UNRESOLVABLE_REFERENCE",[n.ref]),e.path.slice(0,-n.path.length),s&&(r.__$missingReferences=r.__$missingReferences||[],r.__$missingReferences.push(n))),n.obj["__"+n.key+"Resolved"]=o}var a=e.isValid();return a?r.__$compiled=!0:r.id&&SchemaCache.removeFromCacheByUri.call(this,r.id),a};


},{"./Report":69,"./SchemaCache":70}],72:[function(require,module,exports){
"use strict";var FormatValidators=require("./FormatValidators"),JsonValidation=require("./JsonValidation"),Report=require("./Report"),Utils=require("./Utils"),SchemaValidators={$ref:function(r,e){"string"!=typeof e.$ref&&r.addError("KEYWORD_TYPE_EXPECTED",["$ref","string"])},$schema:function(r,e){"string"!=typeof e.$schema&&r.addError("KEYWORD_TYPE_EXPECTED",["$schema","string"])},multipleOf:function(r,e){"number"!=typeof e.multipleOf?r.addError("KEYWORD_TYPE_EXPECTED",["multipleOf","number"]):e.multipleOf<=0&&r.addError("KEYWORD_MUST_BE",["multipleOf","strictly greater than 0"])},maximum:function(r,e){"number"!=typeof e.maximum&&r.addError("KEYWORD_TYPE_EXPECTED",["maximum","number"])},exclusiveMaximum:function(r,e){"boolean"!=typeof e.exclusiveMaximum?r.addError("KEYWORD_TYPE_EXPECTED",["exclusiveMaximum","boolean"]):void 0===e.maximum&&r.addError("KEYWORD_DEPENDENCY",["exclusiveMaximum","maximum"])},minimum:function(r,e){"number"!=typeof e.minimum&&r.addError("KEYWORD_TYPE_EXPECTED",["minimum","number"])},exclusiveMinimum:function(r,e){"boolean"!=typeof e.exclusiveMinimum?r.addError("KEYWORD_TYPE_EXPECTED",["exclusiveMinimum","boolean"]):void 0===e.minimum&&r.addError("KEYWORD_DEPENDENCY",["exclusiveMinimum","minimum"])},maxLength:function(r,e){"integer"!==Utils.whatIs(e.maxLength)?r.addError("KEYWORD_TYPE_EXPECTED",["maxLength","integer"]):e.maxLength<0&&r.addError("KEYWORD_MUST_BE",["maxLength","greater than, or equal to 0"])},minLength:function(r,e){"integer"!==Utils.whatIs(e.minLength)?r.addError("KEYWORD_TYPE_EXPECTED",["minLength","integer"]):e.minLength<0&&r.addError("KEYWORD_MUST_BE",["minLength","greater than, or equal to 0"])},pattern:function(r,e){if("string"!=typeof e.pattern)r.addError("KEYWORD_TYPE_EXPECTED",["pattern","string"]);else try{RegExp(e.pattern)}catch(t){r.addError("KEYWORD_PATTERN",["pattern",e.pattern])}},additionalItems:function(r,e){var t=Utils.whatIs(e.additionalItems);"boolean"!==t&&"object"!==t?r.addError("KEYWORD_TYPE_EXPECTED",["additionalItems",["boolean","object"]]):"object"===t&&(r.path.push("additionalItems"),exports.validateSchema.call(this,r,e.additionalItems),r.path.pop())},items:function(r,e){var t=Utils.whatIs(e.items);if("object"===t)r.path.push("items"),exports.validateSchema.call(this,r,e.items),r.path.pop();else if("array"===t)for(var a=e.items.length;a--;)r.path.push("items"),r.path.push(a.toString()),exports.validateSchema.call(this,r,e.items[a]),r.path.pop(),r.path.pop();else r.addError("KEYWORD_TYPE_EXPECTED",["items",["array","object"]]);this.options.forceAdditional===!0&&void 0===e.additionalItems&&Array.isArray(e.items)&&r.addError("KEYWORD_UNDEFINED_STRICT",["additionalItems"]),this.options.assumeAdditional===!0&&void 0===e.additionalItems&&Array.isArray(e.items)&&(e.additionalItems=!1)},maxItems:function(r,e){"number"!=typeof e.maxItems?r.addError("KEYWORD_TYPE_EXPECTED",["maxItems","integer"]):e.maxItems<0&&r.addError("KEYWORD_MUST_BE",["maxItems","greater than, or equal to 0"])},minItems:function(r,e){"integer"!==Utils.whatIs(e.minItems)?r.addError("KEYWORD_TYPE_EXPECTED",["minItems","integer"]):e.minItems<0&&r.addError("KEYWORD_MUST_BE",["minItems","greater than, or equal to 0"])},uniqueItems:function(r,e){"boolean"!=typeof e.uniqueItems&&r.addError("KEYWORD_TYPE_EXPECTED",["uniqueItems","boolean"])},maxProperties:function(r,e){"integer"!==Utils.whatIs(e.maxProperties)?r.addError("KEYWORD_TYPE_EXPECTED",["maxProperties","integer"]):e.maxProperties<0&&r.addError("KEYWORD_MUST_BE",["maxProperties","greater than, or equal to 0"])},minProperties:function(r,e){"integer"!==Utils.whatIs(e.minProperties)?r.addError("KEYWORD_TYPE_EXPECTED",["minProperties","integer"]):e.minProperties<0&&r.addError("KEYWORD_MUST_BE",["minProperties","greater than, or equal to 0"])},required:function(r,e){if("array"!==Utils.whatIs(e.required))r.addError("KEYWORD_TYPE_EXPECTED",["required","array"]);else if(0===e.required.length)r.addError("KEYWORD_MUST_BE",["required","an array with at least one element"]);else{for(var t=e.required.length;t--;)"string"!=typeof e.required[t]&&r.addError("KEYWORD_VALUE_TYPE",["required","string"]);Utils.isUniqueArray(e.required)===!1&&r.addError("KEYWORD_MUST_BE",["required","an array with unique items"])}},additionalProperties:function(r,e){var t=Utils.whatIs(e.additionalProperties);"boolean"!==t&&"object"!==t?r.addError("KEYWORD_TYPE_EXPECTED",["additionalProperties",["boolean","object"]]):"object"===t&&(r.path.push("additionalProperties"),exports.validateSchema.call(this,r,e.additionalProperties),r.path.pop())},properties:function(r,e){if("object"!==Utils.whatIs(e.properties))return void r.addError("KEYWORD_TYPE_EXPECTED",["properties","object"]);for(var t=Object.keys(e.properties),a=t.length;a--;){var i=t[a],o=e.properties[i];r.path.push("properties"),r.path.push(i),exports.validateSchema.call(this,r,o),r.path.pop(),r.path.pop()}this.options.forceAdditional===!0&&void 0===e.additionalProperties&&r.addError("KEYWORD_UNDEFINED_STRICT",["additionalProperties"]),this.options.assumeAdditional===!0&&void 0===e.additionalProperties&&(e.additionalProperties=!1),this.options.forceProperties===!0&&0===t.length&&r.addError("CUSTOM_MODE_FORCE_PROPERTIES",["properties"])},patternProperties:function(r,e){if("object"!==Utils.whatIs(e.patternProperties))return void r.addError("KEYWORD_TYPE_EXPECTED",["patternProperties","object"]);for(var t=Object.keys(e.patternProperties),a=t.length;a--;){var i=t[a],o=e.patternProperties[i];try{RegExp(i)}catch(n){r.addError("KEYWORD_PATTERN",["patternProperties",i])}r.path.push("patternProperties"),r.path.push(i.toString()),exports.validateSchema.call(this,r,o),r.path.pop(),r.path.pop()}this.options.forceProperties===!0&&0===t.length&&r.addError("CUSTOM_MODE_FORCE_PROPERTIES",["patternProperties"])},dependencies:function(r,e){if("object"!==Utils.whatIs(e.dependencies))r.addError("KEYWORD_TYPE_EXPECTED",["dependencies","object"]);else for(var t=Object.keys(e.dependencies),a=t.length;a--;){var i=t[a],o=e.dependencies[i],n=Utils.whatIs(o);if("object"===n)r.path.push("dependencies"),r.path.push(i),exports.validateSchema.call(this,r,o),r.path.pop(),r.path.pop();else if("array"===n){var E=o.length;for(0===E&&r.addError("KEYWORD_MUST_BE",["dependencies","not empty array"]);E--;)"string"!=typeof o[E]&&r.addError("KEYWORD_VALUE_TYPE",["dependensices","string"]);Utils.isUniqueArray(o)===!1&&r.addError("KEYWORD_MUST_BE",["dependencies","an array with unique items"])}else r.addError("KEYWORD_VALUE_TYPE",["dependencies","object or array"])}},"enum":function(r,e){Array.isArray(e["enum"])===!1?r.addError("KEYWORD_TYPE_EXPECTED",["enum","array"]):0===e["enum"].length?r.addError("KEYWORD_MUST_BE",["enum","an array with at least one element"]):Utils.isUniqueArray(e["enum"])===!1&&r.addError("KEYWORD_MUST_BE",["enum","an array with unique elements"])},type:function(r,e){var t=["array","boolean","integer","number","null","object","string"],a=t.join(","),i=Array.isArray(e.type);if(i){for(var o=e.type.length;o--;)-1===t.indexOf(e.type[o])&&r.addError("KEYWORD_TYPE_EXPECTED",["type",a]);Utils.isUniqueArray(e.type)===!1&&r.addError("KEYWORD_MUST_BE",["type","an object with unique properties"])}else"string"==typeof e.type?-1===t.indexOf(e.type)&&r.addError("KEYWORD_TYPE_EXPECTED",["type",a]):r.addError("KEYWORD_TYPE_EXPECTED",["type",["string","array"]]);this.options.noEmptyStrings===!0&&("string"===e.type||i&&-1!==e.type.indexOf("string"))&&void 0===e.minLength&&(e.minLength=1),this.options.noEmptyArrays===!0&&("array"===e.type||i&&-1!==e.type.indexOf("array"))&&void 0===e.minItems&&(e.minItems=1),this.options.forceProperties===!0&&("object"===e.type||i&&-1!==e.type.indexOf("object"))&&void 0===e.properties&&void 0===e.patternProperties&&r.addError("KEYWORD_UNDEFINED_STRICT",["properties"]),this.options.forceItems===!0&&("array"===e.type||i&&-1!==e.type.indexOf("array"))&&void 0===e.items&&r.addError("KEYWORD_UNDEFINED_STRICT",["items"]),this.options.forceMaxLength===!0&&("string"===e.type||i&&-1!==e.type.indexOf("string"))&&void 0===e.maxLength&&void 0===e.format&&void 0===e["enum"]&&r.addError("KEYWORD_UNDEFINED_STRICT",["maxLength"])},allOf:function(r,e){if(Array.isArray(e.allOf)===!1)r.addError("KEYWORD_TYPE_EXPECTED",["allOf","array"]);else if(0===e.allOf.length)r.addError("KEYWORD_MUST_BE",["allOf","an array with at least one element"]);else for(var t=e.allOf.length;t--;)r.path.push("allOf"),r.path.push(t.toString()),exports.validateSchema.call(this,r,e.allOf[t]),r.path.pop(),r.path.pop()},anyOf:function(r,e){if(Array.isArray(e.anyOf)===!1)r.addError("KEYWORD_TYPE_EXPECTED",["anyOf","array"]);else if(0===e.anyOf.length)r.addError("KEYWORD_MUST_BE",["anyOf","an array with at least one element"]);else for(var t=e.anyOf.length;t--;)r.path.push("anyOf"),r.path.push(t.toString()),exports.validateSchema.call(this,r,e.anyOf[t]),r.path.pop(),r.path.pop()},oneOf:function(r,e){if(Array.isArray(e.oneOf)===!1)r.addError("KEYWORD_TYPE_EXPECTED",["oneOf","array"]);else if(0===e.oneOf.length)r.addError("KEYWORD_MUST_BE",["oneOf","an array with at least one element"]);else for(var t=e.oneOf.length;t--;)r.path.push("oneOf"),r.path.push(t.toString()),exports.validateSchema.call(this,r,e.oneOf[t]),r.path.pop(),r.path.pop()},not:function(r,e){"object"!==Utils.whatIs(e.not)?r.addError("KEYWORD_TYPE_EXPECTED",["not","object"]):(r.path.push("not"),exports.validateSchema.call(this,r,e.not),r.path.pop())},definitions:function(r,e){if("object"!==Utils.whatIs(e.definitions))r.addError("KEYWORD_TYPE_EXPECTED",["definitions","object"]);else for(var t=Object.keys(e.definitions),a=t.length;a--;){var i=t[a],o=e.definitions[i];r.path.push("definitions"),r.path.push(i),exports.validateSchema.call(this,r,o),r.path.pop(),r.path.pop()}},format:function(r,e){"string"!=typeof e.format?r.addError("KEYWORD_TYPE_EXPECTED",["format","string"]):void 0===FormatValidators[e.format]&&r.addError("UNKNOWN_FORMAT",[e.format])},id:function(r,e){"string"!=typeof e.id&&r.addError("KEYWORD_TYPE_EXPECTED",["id","string"])},title:function(r,e){"string"!=typeof e.title&&r.addError("KEYWORD_TYPE_EXPECTED",["title","string"])},description:function(r,e){"string"!=typeof e.description&&r.addError("KEYWORD_TYPE_EXPECTED",["description","string"])},"default":function(){}},validateArrayOfSchemas=function(r,e){for(var t=e.length;t--;)exports.validateSchema.call(this,r,e[t]);return r.isValid()};exports.validateSchema=function(r,e){if(r.commonErrorMessage="SCHEMA_VALIDATION_FAILED",Array.isArray(e))return validateArrayOfSchemas.call(this,r,e);if(e.__$validated)return!0;var t=e.$schema&&e.id!==e.$schema;if(t)if(e.__$schemaResolved&&e.__$schemaResolved!==e){var a=new Report(r),i=JsonValidation.validate.call(this,a,e.__$schemaResolved,e);i===!1&&r.addError("PARENT_SCHEMA_VALIDATION_FAILED",null,a)}else this.options.ignoreUnresolvableReferences!==!0&&r.addError("REF_UNRESOLVED",[e.$schema]);if(this.options.noTypeless===!0){if(void 0!==e.type){var o=[];Array.isArray(e.anyOf)&&(o=o.concat(e.anyOf)),Array.isArray(e.oneOf)&&(o=o.concat(e.oneOf)),Array.isArray(e.allOf)&&(o=o.concat(e.allOf)),o.forEach(function(r){r.type||(r.type=e.type)})}void 0===e.type&&void 0===e.anyOf&&void 0===e.oneOf&&void 0===e.not&&void 0===e.$ref&&r.addError("KEYWORD_UNDEFINED_STRICT",["type"])}for(var n=Object.keys(e),E=n.length;E--;){var s=n[E];0!==s.indexOf("__")&&(void 0!==SchemaValidators[s]?SchemaValidators[s].call(this,r,e):t||this.options.noExtraKeywords===!0&&r.addError("KEYWORD_UNEXPECTED",[s]))}var d=r.isValid();return d&&(e.__$validated=!0),d};


},{"./FormatValidators":66,"./JsonValidation":67,"./Report":69,"./Utils":73}],73:[function(require,module,exports){
"use strict";exports.whatIs=function(r){var e=typeof r;return"object"===e?null===r?"null":Array.isArray(r)?"array":"object":"number"===e?Number.isFinite(r)?r%1===0?"integer":"number":Number.isNaN(r)?"not-a-number":"unknown-number":e},exports.areEqual=function r(e,t){if(e===t)return!0;var n,u;if(Array.isArray(e)&&Array.isArray(t)){if(e.length!==t.length)return!1;for(u=e.length,n=0;u>n;n++)if(!r(e[n],t[n]))return!1;return!0}if("object"===exports.whatIs(e)&&"object"===exports.whatIs(t)){var o=Object.keys(e),a=Object.keys(t);if(!r(o,a))return!1;for(u=o.length,n=0;u>n;n++)if(!r(e[o[n]],t[o[n]]))return!1;return!0}return!1},exports.isUniqueArray=function(r,e){var t,n,u=r.length;for(t=0;u>t;t++)for(n=t+1;u>n;n++)if(exports.areEqual(r[t],r[n]))return e&&e.push(t,n),!1;return!0},exports.difference=function(r,e){for(var t=[],n=r.length;n--;)-1===e.indexOf(r[n])&&t.push(r[n]);return t},exports.clone=function(r){if("object"!=typeof r||null===r)return r;var e,t;if(Array.isArray(r))for(e=[],t=r.length;t--;)e[t]=r[t];else{e={};var n=Object.keys(r);for(t=n.length;t--;){var u=n[t];e[u]=r[u]}}return e},exports.cloneDeep=function e(r){if("object"!=typeof r||null===r)return r;var t,n;if(Array.isArray(r))for(t=[],n=r.length;n--;)t[n]=e(r[n]);else{t={};var u=Object.keys(r);for(n=u.length;n--;){var o=u[n];t[o]=e(r[o])}}return t};


},{}],74:[function(require,module,exports){
"use strict";function ZSchema(e){if(this.cache={},this.referenceCache=[],"object"==typeof e){for(var t=Object.keys(e),o=t.length;o--;){var r=t[o];if(void 0===defaultOptions[r])throw new Error("Unexpected option passed to constructor: "+r)}this.options=e}else this.options=Utils.clone(defaultOptions);this.options.strictMode===!0&&(this.options.forceAdditional=!0,this.options.forceItems=!0,this.options.forceMaxLength=!0,this.options.forceProperties=!0,this.options.noExtraKeywords=!0,this.options.noTypeless=!0,this.options.noEmptyStrings=!0,this.options.noEmptyArrays=!0)}require("./Polyfills");var Report=require("./Report"),FormatValidators=require("./FormatValidators"),JsonValidation=require("./JsonValidation"),SchemaCache=require("./SchemaCache"),SchemaCompilation=require("./SchemaCompilation"),SchemaValidation=require("./SchemaValidation"),Utils=require("./Utils"),defaultOptions={asyncTimeout:2e3,forceAdditional:!1,assumeAdditional:!1,forceItems:!1,forceMaxLength:!1,forceProperties:!1,ignoreUnresolvableReferences:!1,noExtraKeywords:!1,noTypeless:!1,noEmptyStrings:!1,noEmptyArrays:!1,strictUris:!1,strictMode:!1,reportPathAsArray:!1,breakOnFirstError:!0};ZSchema.prototype.compileSchema=function(e){var t=new Report(this.options);return"object"==typeof e&&(e=SchemaCache.getSchemaByReference.call(this,e)),"string"==typeof e&&(e=SchemaCache.getSchemaByUri.call(this,t,e)),SchemaCompilation.compileSchema.call(this,t,e),this.lastReport=t,t.isValid()},ZSchema.prototype.validateSchema=function(e){var t=new Report(this.options);"object"==typeof e&&(e=SchemaCache.getSchemaByReference.call(this,e)),"string"==typeof e&&(e=SchemaCache.getSchemaByUri.call(this,t,e));var o=SchemaCompilation.compileSchema.call(this,t,e);return o&&SchemaValidation.validateSchema.call(this,t,e),this.lastReport=t,t.isValid()},ZSchema.prototype.validate=function(e,t,o){var r=new Report(this.options);"object"==typeof t&&(t=SchemaCache.getSchemaByReference.call(this,t)),"string"==typeof t&&(t=SchemaCache.getSchemaByUri.call(this,r,t));var a=SchemaCompilation.compileSchema.call(this,r,t);if(!a)return this.lastReport=r,!1;var i=SchemaValidation.validateSchema.call(this,r,t);if(!i)return this.lastReport=r,!1;if(JsonValidation.validate.call(this,r,t,e),o)return void r.processAsyncTasks(this.options.asyncTimeout,o);if(r.asyncTasks.length>0)throw new Error("This validation has async tasks and cannot be done in sync mode, please provide callback argument.");return this.lastReport=r,r.isValid()},ZSchema.prototype.getLastError=function(){if(0===this.lastReport.errors.length)return null;var e=new Error;return e.name="z-schema validation error",e.message=this.lastReport.commonErrorMessage,e.details=this.lastReport.errors,e},ZSchema.prototype.getLastErrors=function(){return this.lastReport.errors.length>0?this.lastReport.errors:void 0},ZSchema.prototype.getMissingReferences=function(){for(var e=[],t=this.lastReport.errors.length;t--;){var o=this.lastReport.errors[t];if("UNRESOLVABLE_REFERENCE"===o.code){var r=o.params[0];-1===e.indexOf(r)&&e.push(r)}}return e},ZSchema.prototype.getMissingRemoteReferences=function(){for(var e=this.getMissingReferences(),t=[],o=e.length;o--;){var r=SchemaCache.getRemotePath(e[o]);r&&-1===t.indexOf(r)&&t.push(r)}return t},ZSchema.prototype.setRemoteReference=function(e,t){"string"==typeof t&&(t=JSON.parse(t)),SchemaCache.cacheSchemaByUri.call(this,e,t)},ZSchema.registerFormat=function(e,t){FormatValidators[e]=t},ZSchema.getDefaultOptions=function(){return Utils.cloneDeep(defaultOptions)},module.exports=ZSchema;


},{"./FormatValidators":66,"./JsonValidation":67,"./Polyfills":68,"./Report":69,"./SchemaCache":70,"./SchemaCompilation":71,"./SchemaValidation":72,"./Utils":73}],75:[function(require,module,exports){
module.exports={
    "id": "http://wordnik.github.io/schemas/v1.2/apiDeclaration.json#",
    "$schema": "http://json-schema.org/draft-04/schema#",
    "type": "object",
    "required": [ "swaggerVersion", "basePath", "apis" ],
    "properties": {
        "swaggerVersion": { "enum": [ "1.2" ] },
        "apiVersion": { "type": "string" },
        "basePath": {
            "type": "string",
            "format": "uri",
            "pattern": "^https?://"
        },
        "resourcePath": {
            "type": "string",
            "format": "uri",
            "pattern": "^/"
        },
        "apis": {
            "type": "array",
            "items": { "$ref": "#/definitions/apiObject" }
        },
        "models": {
            "type": "object",
            "additionalProperties": {
                "$ref": "modelsObject.json#"
            }
        },
        "produces": { "$ref": "#/definitions/mimeTypeArray" },
        "consumes": { "$ref": "#/definitions/mimeTypeArray" },
        "authorizations": { "$ref": "authorizationObject.json#" }
    },
    "additionalProperties": false,
    "definitions": {
        "apiObject": {
            "type": "object",
            "required": [ "path", "operations" ],
            "properties": {
                "path": {
                    "type": "string",
                    "format": "uri-template",
                    "pattern": "^/"
                },
                "description": { "type": "string" },
                "operations": {
                    "type": "array",
                    "items": { "$ref": "operationObject.json#" }
                }
            },
            "additionalProperties": false
        },
        "mimeTypeArray": {
            "type": "array",
            "items": {
                "type": "string",
                "format": "mime-type"
            },
            "uniqueItems": true
        }
    }
}

},{}],76:[function(require,module,exports){
module.exports={
    "id": "http://wordnik.github.io/schemas/v1.2/authorizationObject.json#",
    "$schema": "http://json-schema.org/draft-04/schema#",
    "type": "object",
    "additionalProperties": {
        "oneOf": [
            {
                "$ref": "#/definitions/basicAuth"
            },
            {
                "$ref": "#/definitions/apiKey"
            },
            {
                "$ref": "#/definitions/oauth2"
            }
        ]
    },
    "definitions": {
        "basicAuth": {
            "required": [ "type" ],
            "properties": {
                "type": { "enum": [ "basicAuth" ] }
            },
            "additionalProperties": false
        },
        "apiKey": {
            "required": [ "type", "passAs", "keyname" ],
            "properties": {
                "type": { "enum": [ "apiKey" ] },
                "passAs": { "enum": [ "header", "query" ] },
                "keyname": { "type": "string" }
            },
            "additionalProperties": false
        },
        "oauth2": {
            "type": "object",
            "required": [ "type", "grantTypes" ],
            "properties": {
                "type": { "enum": [ "oauth2" ] },
                "scopes": {
                    "type": "array",
                    "items": { "$ref": "#/definitions/oauth2Scope" }
                },
                "grantTypes": { "$ref": "oauth2GrantType.json#" }
            },
            "additionalProperties": false
        },
        "oauth2Scope": {
            "type": "object",
            "required": [ "scope" ],
            "properties": {
                "scope": { "type": "string" },
                "description": { "type": "string" }
            },
            "additionalProperties": false
        }
    }
}


},{}],77:[function(require,module,exports){
module.exports={
    "id": "http://wordnik.github.io/schemas/v1.2/dataType.json#",
    "$schema": "http://json-schema.org/draft-04/schema#",
    "description": "Data type as described by the specification (version 1.2)",
    "type": "object",
    "oneOf": [
        { "$ref": "#/definitions/refType" },
        { "$ref": "#/definitions/voidType" },
        { "$ref": "#/definitions/primitiveType" },
        { "$ref": "#/definitions/modelType" },
        { "$ref": "#/definitions/arrayType" }
    ],
    "definitions": {
        "refType": {
            "required": [ "$ref" ],
            "properties": {
                "$ref": { "type": "string" }
            },
            "additionalProperties": false
        },
        "voidType": {
            "enum": [ { "type": "void" } ]
        },
        "modelType": {
            "required": [ "type" ],
            "properties": {
                "type": {
                    "type": "string",
                    "not": {
                        "enum": [ "boolean", "integer", "number", "string", "array" ]
                    }
                }
            },
            "additionalProperties": false
        },
        "primitiveType": {
            "required": [ "type" ],
            "properties": {
                "type": {
                    "enum": [ "boolean", "integer", "number", "string" ]
                },
                "format": { "type": "string" },
                "defaultValue": {
                    "not": { "type": [ "array", "object", "null" ] }
                },
                "enum": {
                    "type": "array",
                    "items": { "type": "string" },
                    "minItems": 1,
                    "uniqueItems": true
                },
                "minimum": { "type": "string" },
                "maximum": { "type": "string" }
            },
            "additionalProperties": false,
            "dependencies": {
                "format": {
                    "oneOf": [
                        {
                            "properties": {
                                "type": { "enum": [ "integer" ] },
                                "format": { "enum": [ "int32", "int64" ] }
                            }
                        },
                        {
                            "properties": {
                                "type": { "enum": [ "number" ] },
                                "format": { "enum": [ "float", "double" ] }
                            }
                        },
                        {
                            "properties": {
                                "type": { "enum": [ "string" ] },
                                "format": {
                                    "enum": [ "byte", "date", "date-time" ]
                                }
                            }
                        }
                    ]
                },
                "enum": {
                    "properties": {
                        "type": { "enum": [ "string" ] }
                    }
                },
                "minimum": {
                    "properties": {
                        "type": { "enum": [ "integer", "number" ] }
                    }
                },
                "maximum": {
                    "properties": {
                        "type": { "enum": [ "integer", "number" ] }
                    }
                }
            }
        },
        "arrayType": {
            "required": [ "type", "items" ],
            "properties": {
                "type": { "enum": [ "array" ] },
                "items": {
                    "type": "array",
                    "items": { "$ref": "#/definitions/itemsObject" }
                },
                "uniqueItems": { "type": "boolean" }
            },
            "additionalProperties": false
        },
        "itemsObject": {
            "oneOf": [
                {
                    "$ref": "#/definitions/refType"
                },
                {
                    "allOf": [
                        {
                            "$ref": "#/definitions/primitiveType"
                        },
                        {
                            "properties": {
                                "type": {},
                                "format": {}
                            },
                            "additionalProperties": false
                        }
                    ]
                }
            ]
        }
    }
}
},{}],78:[function(require,module,exports){
module.exports={
    "id": "http://wordnik.github.io/schemas/v1.2/dataTypeBase.json#",
    "$schema": "http://json-schema.org/draft-04/schema#",
    "description": "Data type fields (section 4.3.3)",
    "type": "object",
    "oneOf": [
        { "required": [ "type" ] },
        { "required": [ "$ref" ] }
    ],
    "properties": {
        "type": { "type": "string" },
        "$ref": { "type": "string" },
        "format": { "type": "string" },
        "defaultValue": {
            "not": { "type": [ "array", "object", "null" ] }
        },
        "enum": {
            "type": "array",
            "items": { "type": "string" },
            "uniqueItems": true,
            "minItems": 1
        },
        "minimum": { "type": "string" },
        "maximum": { "type": "string" },
        "items": { "$ref": "#/definitions/itemsObject" },
        "uniqueItems": { "type": "boolean" }
    },
    "dependencies": {
        "format": {
            "oneOf": [
                {
                    "properties": {
                        "type": { "enum": [ "integer" ] },
                        "format": { "enum": [ "int32", "int64" ] }
                    }
                },
                {
                    "properties": {
                        "type": { "enum": [ "number" ] },
                        "format": { "enum": [ "float", "double" ] }
                    }
                },
                {
                    "properties": {
                        "type": { "enum": [ "string" ] },
                        "format": {
                            "enum": [ "byte", "date", "date-time" ]
                        }
                    }
                }
            ]
        }
    },
    "definitions": {
        "itemsObject": {
            "oneOf": [
                {
                    "type": "object",
                    "required": [ "$ref" ],
                    "properties": {
                        "$ref": { "type": "string" }
                    },
                    "additionalProperties": false
                },
                {
                    "allOf": [
                        { "$ref": "#" },
                        {
                            "required": [ "type" ],
                            "properties": {
                                "type": {},
                                "format": {}
                            },
                            "additionalProperties": false
                        }
                    ]
                }
            ]
        }
    }
}

},{}],79:[function(require,module,exports){
module.exports={
    "id": "http://wordnik.github.io/schemas/v1.2/infoObject.json#",
    "$schema": "http://json-schema.org/draft-04/schema#",
    "description": "info object (section 5.1.3)",
    "type": "object",
    "required": [ "title", "description" ],
    "properties": {
        "title": { "type": "string" },
        "description": { "type": "string" },
        "termsOfServiceUrl": { "type": "string", "format": "uri" },
        "contact": { "type": "string", "format": "email" },
        "license": { "type": "string" },
        "licenseUrl": { "type": "string", "format": "uri" }
    },
    "additionalProperties": false
}
},{}],80:[function(require,module,exports){
module.exports={
    "id": "http://wordnik.github.io/schemas/v1.2/modelsObject.json#",
    "$schema": "http://json-schema.org/draft-04/schema#",
    "type": "object",
    "required": [ "id", "properties" ],
    "properties": {
        "id": { "type": "string" },
        "description": { "type": "string" },
        "properties": {
            "type": "object",
            "additionalProperties": { "$ref": "#/definitions/propertyObject" }
        },
        "subTypes": {
            "type": "array",
            "items": { "type": "string" },
            "uniqueItems": true
        },
        "discriminator": { "type": "string" }
    },
    "dependencies": {
        "subTypes": [ "discriminator" ]
    },
    "definitions": {
        "propertyObject": {
            "allOf": [
                {
                    "not": { "$ref": "#" }
                },
                {
                    "$ref": "dataTypeBase.json#"
                }
            ]
        }
    }
}


},{}],81:[function(require,module,exports){
module.exports={
    "id": "http://wordnik.github.io/schemas/v1.2/oauth2GrantType.json#",
    "$schema": "http://json-schema.org/draft-04/schema#",
    "type": "object",
    "minProperties": 1,
    "properties": {
        "implicit": { "$ref": "#/definitions/implicit" },
        "authorization_code": { "$ref": "#/definitions/authorizationCode" }
    },
    "definitions": {
        "implicit": {
            "type": "object",
            "required": [ "loginEndpoint" ],
            "properties": {
                "loginEndpoint": { "$ref": "#/definitions/loginEndpoint" },
                "tokenName": { "type": "string" }
            },
            "additionalProperties": false
        },
        "authorizationCode": {
            "type": "object",
            "required": [ "tokenEndpoint", "tokenRequestEndpoint" ],
            "properties": {
                "tokenEndpoint": { "$ref": "#/definitions/tokenEndpoint" },
                "tokenRequestEndpoint": { "$ref": "#/definitions/tokenRequestEndpoint" }
            },
            "additionalProperties": false
        },
        "loginEndpoint": {
            "type": "object",
            "required": [ "url" ],
            "properties": {
                "url": { "type": "string", "format": "uri" }
            },
            "additionalProperties": false
        },
        "tokenEndpoint": {
            "type": "object",
            "required": [ "url" ],
            "properties": {
                "url": { "type": "string", "format": "uri" },
                "tokenName": { "type": "string" }
            },
            "additionalProperties": false
        },
        "tokenRequestEndpoint": {
            "type": "object",
            "required": [ "url" ],
            "properties": {
                "url": { "type": "string", "format": "uri" },
                "clientIdName": { "type": "string" },
                "clientSecretName": { "type": "string" }
            },
            "additionalProperties": false
        }
    }
}
},{}],82:[function(require,module,exports){
module.exports={
    "id": "http://wordnik.github.io/schemas/v1.2/operationObject.json#",
    "$schema": "http://json-schema.org/draft-04/schema#",
    "type": "object",
    "allOf": [
        { "$ref": "dataTypeBase.json#" },
        {
            "required": [ "method", "nickname", "parameters" ],
            "properties": {
                "method": { "enum": [ "GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS" ] },
                "summary": { "type": "string", "maxLength": 120 },
                "notes": { "type": "string" },
                "nickname": {
                    "type": "string",
                    "pattern": "^[a-zA-Z0-9_]+$"
                },
                "authorizations": {
                    "type": "object",
                    "additionalProperties": {
                        "type": "array",
                        "items": {
                            "$ref": "authorizationObject.json#/definitions/oauth2Scope"
                        }
                    }
                },
                "parameters": {
                    "type": "array",
                    "items": { "$ref": "parameterObject.json#" }
                },
                "responseMessages": {
                    "type": "array",
                    "items": { "$ref": "#/definitions/responseMessageObject"}
                },
                "produces": { "$ref": "#/definitions/mimeTypeArray" },
                "consumes": { "$ref": "#/definitions/mimeTypeArray" },
                "deprecated": { "enum": [ "true", "false" ] }
            }
        }
    ],
    "definitions": {
        "responseMessageObject": {
            "type": "object",
            "required": [ "code", "message" ],
            "properties": {
                "code": { "$ref": "#/definitions/rfc2616section10" },
                "message": { "type": "string" },
                "responseModel": { "type": "string" }
            }
        },
        "rfc2616section10": {
            "type": "integer",
            "minimum": 100,
            "maximum": 600,
            "exclusiveMaximum": true
        },
        "mimeTypeArray": {
            "type": "array",
            "items": {
                "type": "string",
                "format": "mime-type"
            },
            "uniqueItems": true
        }
    }
}

},{}],83:[function(require,module,exports){
module.exports={
    "id": "http://wordnik.github.io/schemas/v1.2/parameterObject.json#",
    "$schema": "http://json-schema.org/draft-04/schema#",
    "type": "object",
    "allOf": [
        { "$ref": "dataTypeBase.json#" },
        {
            "required": [ "paramType", "name" ],
            "properties": {
                "paramType": {
                    "enum": [ "path", "query", "body", "header", "form" ]
                },
                "name": { "type": "string" },
                "description": { "type": "string" },
                "required": { "type": "boolean" },
                "allowMultiple": { "type": "boolean" }
            }
        },
        {
            "description": "type File requires special paramType and consumes",
            "oneOf": [
                {
                    "properties": {
                        "type": { "not": { "enum": [ "File" ] } }
                    }
                },
                {
                    "properties": {
                        "type": { "enum": [ "File" ] },
                        "paramType": { "enum": [ "form" ] },
                        "consumes": { "enum": [ "multipart/form-data" ] }
                    }
                }
            ]
        }
    ]
}

},{}],84:[function(require,module,exports){
module.exports={
    "id": "http://wordnik.github.io/schemas/v1.2/resourceListing.json#",
    "$schema": "http://json-schema.org/draft-04/schema#",
    "type": "object",
    "required": [ "swaggerVersion", "apis" ],
    "properties": {
        "swaggerVersion": { "enum": [ "1.2" ] },
        "apis": {
            "type": "array",
            "items": { "$ref": "resourceObject.json#" }
        },
        "apiVersion": { "type": "string" },
        "info": { "$ref": "infoObject.json#" },
        "authorizations": { "$ref": "authorizationObject.json#" }
    }
}

},{}],85:[function(require,module,exports){
module.exports={
    "id": "http://wordnik.github.io/schemas/v1.2/resourceObject.json#",
    "$schema": "http://json-schema.org/draft-04/schema#",
    "type": "object",
    "required": [ "path" ],
    "properties": {
        "path": { "type": "string", "format": "uri" },
        "description": { "type": "string" }
    },
    "additionalProperties": false
}
},{}],86:[function(require,module,exports){
module.exports={
  "title": "A JSON Schema for Swagger 2.0 API.",
  "id": "http://swagger.io/v2/schema.json#",
  "$schema": "http://json-schema.org/draft-04/schema#",
  "type": "object",
  "required": [
    "swagger",
    "info",
    "paths"
  ],
  "additionalProperties": false,
  "patternProperties": {
    "^x-": {
      "$ref": "#/definitions/vendorExtension"
    }
  },
  "properties": {
    "swagger": {
      "type": "string",
      "enum": [
        "2.0"
      ],
      "description": "The Swagger version of this document."
    },
    "info": {
      "$ref": "#/definitions/info"
    },
    "host": {
      "type": "string",
      "format": "uri",
      "pattern": "^[^{}/ :\\\\]+(?::\\d+)?$",
      "description": "The fully qualified URI to the host of the API."
    },
    "basePath": {
      "type": "string",
      "pattern": "^/",
      "description": "The base path to the API. Example: '/api'."
    },
    "schemes": {
      "$ref": "#/definitions/schemesList"
    },
    "consumes": {
      "description": "A list of MIME types accepted by the API.",
      "$ref": "#/definitions/mediaTypeList"
    },
    "produces": {
      "description": "A list of MIME types the API can produce.",
      "$ref": "#/definitions/mediaTypeList"
    },
    "paths": {
      "$ref": "#/definitions/paths"
    },
    "definitions": {
      "$ref": "#/definitions/definitions"
    },
    "parameters": {
      "$ref": "#/definitions/parameterDefinitions"
    },
    "responses": {
      "$ref": "#/definitions/responseDefinitions"
    },
    "security": {
      "$ref": "#/definitions/security"
    },
    "securityDefinitions": {
      "$ref": "#/definitions/securityDefinitions"
    },
    "tags": {
      "type": "array",
      "items": {
        "$ref": "#/definitions/tag"
      },
      "uniqueItems": true
    },
    "externalDocs": {
      "$ref": "#/definitions/externalDocs"
    }
  },
  "definitions": {
    "info": {
      "type": "object",
      "description": "General information about the API.",
      "required": [
        "version",
        "title"
      ],
      "additionalProperties": false,
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      },
      "properties": {
        "title": {
          "type": "string",
          "description": "A unique and precise title of the API."
        },
        "version": {
          "type": "string",
          "description": "A semantic version number of the API."
        },
        "description": {
          "type": "string",
          "description": "A longer description of the API. Should be different from the title.  Github-flavored markdown is allowed."
        },
        "termsOfService": {
          "type": "string",
          "description": "The terms of service for the API."
        },
        "contact": {
          "$ref": "#/definitions/contact"
        },
        "license": {
          "$ref": "#/definitions/license"
        }
      }
    },
    "contact": {
      "type": "object",
      "description": "Contact information for the owners of the API.",
      "additionalProperties": false,
      "properties": {
        "name": {
          "type": "string",
          "description": "The identifying name of the contact person/organization."
        },
        "url": {
          "type": "string",
          "description": "The URL pointing to the contact information.",
          "format": "uri"
        },
        "email": {
          "type": "string",
          "description": "The email address of the contact person/organization.",
          "format": "email"
        }
      }
    },
    "license": {
      "type": "object",
      "required": [
        "name"
      ],
      "additionalProperties": false,
      "properties": {
        "name": {
          "type": "string",
          "description": "The name of the license type. It's encouraged to use an OSI compatible license."
        },
        "url": {
          "type": "string",
          "description": "The URL pointing to the license.",
          "format": "uri"
        }
      }
    },
    "paths": {
      "type": "object",
      "description": "Relative paths to the individual endpoints. They must be relative to the 'basePath'.",
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        },
        "^/": {
          "$ref": "#/definitions/pathItem"
        }
      },
      "additionalProperties": false
    },
    "definitions": {
      "type": "object",
      "additionalProperties": {
        "$ref": "#/definitions/schema"
      },
      "description": "One or more JSON objects describing the schemas being consumed and produced by the API."
    },
    "parameterDefinitions": {
      "type": "object",
      "additionalProperties": {
        "$ref": "#/definitions/parameter"
      },
      "description": "One or more JSON representations for parameters"
    },
    "responseDefinitions": {
      "type": "object",
      "additionalProperties": {
        "$ref": "#/definitions/response"
      },
      "description": "One or more JSON representations for parameters"
    },
    "externalDocs": {
      "type": "object",
      "additionalProperties": false,
      "description": "information about external documentation",
      "required": [
        "url"
      ],
      "properties": {
        "description": {
          "type": "string"
        },
        "url": {
          "type": "string",
          "format": "uri"
        }
      }
    },
    "examples": {
      "type": "object",
      "patternProperties": {
        "^[a-z0-9-]+/[a-z0-9\\-+]+$": {}
      },
      "additionalProperties": false
    },
    "mimeType": {
      "type": "string",
      "pattern": "^[\\sa-z0-9\\-+;\\.=\\/]+$",
      "description": "The MIME type of the HTTP message."
    },
    "operation": {
      "type": "object",
      "required": [
        "responses"
      ],
      "additionalProperties": false,
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      },
      "properties": {
        "tags": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "uniqueItems": true
        },
        "summary": {
          "type": "string",
          "description": "A brief summary of the operation."
        },
        "description": {
          "type": "string",
          "description": "A longer description of the operation, github-flavored markdown is allowed."
        },
        "externalDocs": {
          "$ref": "#/definitions/externalDocs"
        },
        "operationId": {
          "type": "string",
          "description": "A friendly name of the operation"
        },
        "produces": {
          "description": "A list of MIME types the API can produce.",
          "$ref": "#/definitions/mediaTypeList"
        },
        "consumes": {
          "description": "A list of MIME types the API can consume.",
          "$ref": "#/definitions/mediaTypeList"
        },
        "parameters": {
          "$ref": "#/definitions/parametersList"
        },
        "responses": {
          "$ref": "#/definitions/responses"
        },
        "schemes": {
          "$ref": "#/definitions/schemesList"
        },
        "deprecated": {
          "type": "boolean",
          "default": false
        },
        "security": {
          "$ref": "#/definitions/security"
        }
      }
    },
    "pathItem": {
      "type": "object",
      "additionalProperties": false,
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      },
      "properties": {
        "$ref": {
          "type": "string"
        },
        "get": {
          "$ref": "#/definitions/operation"
        },
        "put": {
          "$ref": "#/definitions/operation"
        },
        "post": {
          "$ref": "#/definitions/operation"
        },
        "delete": {
          "$ref": "#/definitions/operation"
        },
        "options": {
          "$ref": "#/definitions/operation"
        },
        "head": {
          "$ref": "#/definitions/operation"
        },
        "patch": {
          "$ref": "#/definitions/operation"
        },
        "parameters": {
          "$ref": "#/definitions/parametersList"
        }
      }
    },
    "responses": {
      "type": "object",
      "description": "Response objects names can either be any valid HTTP status code or 'default'.",
      "minProperties": 1,
      "additionalProperties": false,
      "patternProperties": {
        "^([0-9]{3})$|^(default)$": {
          "$ref": "#/definitions/responseValue"
        },
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      },
      "not": {
        "type": "object",
        "additionalProperties": false,
        "patternProperties": {
          "^x-": {
            "$ref": "#/definitions/vendorExtension"
          }
        }
      }
    },
    "responseValue": {
      "oneOf": [
        {
          "$ref": "#/definitions/response"
        },
        {
          "$ref": "#/definitions/jsonReference"
        }
      ]
    },
    "response": {
      "type": "object",
      "required": [
        "description"
      ],
      "properties": {
        "description": {
          "type": "string"
        },
        "schema": {
          "$ref": "#/definitions/schema"
        },
        "headers": {
          "$ref": "#/definitions/headers"
        },
        "examples": {
          "$ref": "#/definitions/examples"
        }
      },
      "additionalProperties": false
    },
    "headers": {
      "type": "object",
      "additionalProperties": {
        "$ref": "#/definitions/header"
      }
    },
    "header": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "type"
      ],
      "properties": {
        "type": {
          "type": "string",
          "enum": [
            "string",
            "number",
            "integer",
            "boolean",
            "array"
          ]
        },
        "format": {
          "type": "string"
        },
        "items": {
          "$ref": "#/definitions/primitivesItems"
        },
        "collectionFormat": {
          "$ref": "#/definitions/collectionFormat"
        },
        "default": {
          "$ref": "#/definitions/default"
        },
        "maximum": {
          "$ref": "#/definitions/maximum"
        },
        "exclusiveMaximum": {
          "$ref": "#/definitions/exclusiveMaximum"
        },
        "minimum": {
          "$ref": "#/definitions/minimum"
        },
        "exclusiveMinimum": {
          "$ref": "#/definitions/exclusiveMinimum"
        },
        "maxLength": {
          "$ref": "#/definitions/maxLength"
        },
        "minLength": {
          "$ref": "#/definitions/minLength"
        },
        "pattern": {
          "$ref": "#/definitions/pattern"
        },
        "maxItems": {
          "$ref": "#/definitions/maxItems"
        },
        "minItems": {
          "$ref": "#/definitions/minItems"
        },
        "uniqueItems": {
          "$ref": "#/definitions/uniqueItems"
        },
        "enum": {
          "$ref": "#/definitions/enum"
        },
        "multipleOf": {
          "$ref": "#/definitions/multipleOf"
        },
        "description": {
          "type": "string"
        }
      }
    },
    "vendorExtension": {
      "description": "Any property starting with x- is valid.",
      "additionalProperties": true,
      "additionalItems": true
    },
    "bodyParameter": {
      "type": "object",
      "required": [
        "name",
        "in",
        "schema"
      ],
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      },
      "properties": {
        "description": {
          "type": "string",
          "description": "A brief description of the parameter. This could contain examples of use.  Github-flavored markdown is allowed."
        },
        "name": {
          "type": "string",
          "description": "The name of the parameter."
        },
        "in": {
          "type": "string",
          "description": "Determines the location of the parameter.",
          "enum": [
            "body"
          ]
        },
        "required": {
          "type": "boolean",
          "description": "Determines whether or not this parameter is required or optional.",
          "default": false
        },
        "schema": {
          "$ref": "#/definitions/schema"
        }
      },
      "additionalProperties": false
    },
    "headerParameterSubSchema": {
      "additionalProperties": false,
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      },
      "properties": {
        "required": {
          "type": "boolean",
          "description": "Determines whether or not this parameter is required or optional.",
          "default": false
        },
        "in": {
          "type": "string",
          "description": "Determines the location of the parameter.",
          "enum": [
            "header"
          ]
        },
        "description": {
          "type": "string",
          "description": "A brief description of the parameter. This could contain examples of use.  Github-flavored markdown is allowed."
        },
        "name": {
          "type": "string",
          "description": "The name of the parameter."
        },
        "type": {
          "type": "string",
          "enum": [
            "string",
            "number",
            "boolean",
            "integer",
            "array"
          ]
        },
        "format": {
          "type": "string"
        },
        "items": {
          "$ref": "#/definitions/primitivesItems"
        },
        "collectionFormat": {
          "$ref": "#/definitions/collectionFormat"
        },
        "default": {
          "$ref": "#/definitions/default"
        },
        "maximum": {
          "$ref": "#/definitions/maximum"
        },
        "exclusiveMaximum": {
          "$ref": "#/definitions/exclusiveMaximum"
        },
        "minimum": {
          "$ref": "#/definitions/minimum"
        },
        "exclusiveMinimum": {
          "$ref": "#/definitions/exclusiveMinimum"
        },
        "maxLength": {
          "$ref": "#/definitions/maxLength"
        },
        "minLength": {
          "$ref": "#/definitions/minLength"
        },
        "pattern": {
          "$ref": "#/definitions/pattern"
        },
        "maxItems": {
          "$ref": "#/definitions/maxItems"
        },
        "minItems": {
          "$ref": "#/definitions/minItems"
        },
        "uniqueItems": {
          "$ref": "#/definitions/uniqueItems"
        },
        "enum": {
          "$ref": "#/definitions/enum"
        },
        "multipleOf": {
          "$ref": "#/definitions/multipleOf"
        }
      }
    },
    "queryParameterSubSchema": {
      "additionalProperties": false,
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      },
      "properties": {
        "required": {
          "type": "boolean",
          "description": "Determines whether or not this parameter is required or optional.",
          "default": false
        },
        "in": {
          "type": "string",
          "description": "Determines the location of the parameter.",
          "enum": [
            "query"
          ]
        },
        "description": {
          "type": "string",
          "description": "A brief description of the parameter. This could contain examples of use.  Github-flavored markdown is allowed."
        },
        "name": {
          "type": "string",
          "description": "The name of the parameter."
        },
        "type": {
          "type": "string",
          "enum": [
            "string",
            "number",
            "boolean",
            "integer",
            "array"
          ]
        },
        "format": {
          "type": "string"
        },
        "items": {
          "$ref": "#/definitions/primitivesItems"
        },
        "collectionFormat": {
          "$ref": "#/definitions/collectionFormatWithMulti"
        },
        "default": {
          "$ref": "#/definitions/default"
        },
        "maximum": {
          "$ref": "#/definitions/maximum"
        },
        "exclusiveMaximum": {
          "$ref": "#/definitions/exclusiveMaximum"
        },
        "minimum": {
          "$ref": "#/definitions/minimum"
        },
        "exclusiveMinimum": {
          "$ref": "#/definitions/exclusiveMinimum"
        },
        "maxLength": {
          "$ref": "#/definitions/maxLength"
        },
        "minLength": {
          "$ref": "#/definitions/minLength"
        },
        "pattern": {
          "$ref": "#/definitions/pattern"
        },
        "maxItems": {
          "$ref": "#/definitions/maxItems"
        },
        "minItems": {
          "$ref": "#/definitions/minItems"
        },
        "uniqueItems": {
          "$ref": "#/definitions/uniqueItems"
        },
        "enum": {
          "$ref": "#/definitions/enum"
        },
        "multipleOf": {
          "$ref": "#/definitions/multipleOf"
        }
      }
    },
    "formDataParameterSubSchema": {
      "additionalProperties": false,
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      },
      "properties": {
        "required": {
          "type": "boolean",
          "description": "Determines whether or not this parameter is required or optional.",
          "default": false
        },
        "in": {
          "type": "string",
          "description": "Determines the location of the parameter.",
          "enum": [
            "formData"
          ]
        },
        "description": {
          "type": "string",
          "description": "A brief description of the parameter. This could contain examples of use.  Github-flavored markdown is allowed."
        },
        "name": {
          "type": "string",
          "description": "The name of the parameter."
        },
        "type": {
          "type": "string",
          "enum": [
            "string",
            "number",
            "boolean",
            "integer",
            "array",
            "file"
          ]
        },
        "format": {
          "type": "string"
        },
        "items": {
          "$ref": "#/definitions/primitivesItems"
        },
        "collectionFormat": {
          "$ref": "#/definitions/collectionFormatWithMulti"
        },
        "default": {
          "$ref": "#/definitions/default"
        },
        "maximum": {
          "$ref": "#/definitions/maximum"
        },
        "exclusiveMaximum": {
          "$ref": "#/definitions/exclusiveMaximum"
        },
        "minimum": {
          "$ref": "#/definitions/minimum"
        },
        "exclusiveMinimum": {
          "$ref": "#/definitions/exclusiveMinimum"
        },
        "maxLength": {
          "$ref": "#/definitions/maxLength"
        },
        "minLength": {
          "$ref": "#/definitions/minLength"
        },
        "pattern": {
          "$ref": "#/definitions/pattern"
        },
        "maxItems": {
          "$ref": "#/definitions/maxItems"
        },
        "minItems": {
          "$ref": "#/definitions/minItems"
        },
        "uniqueItems": {
          "$ref": "#/definitions/uniqueItems"
        },
        "enum": {
          "$ref": "#/definitions/enum"
        },
        "multipleOf": {
          "$ref": "#/definitions/multipleOf"
        }
      }
    },
    "pathParameterSubSchema": {
      "additionalProperties": false,
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      },
      "properties": {
        "required": {
          "type": "boolean",
          "enum": [
            true
          ],
          "description": "Determines whether or not this parameter is required or optional."
        },
        "in": {
          "type": "string",
          "description": "Determines the location of the parameter.",
          "enum": [
            "path"
          ]
        },
        "description": {
          "type": "string",
          "description": "A brief description of the parameter. This could contain examples of use.  Github-flavored markdown is allowed."
        },
        "name": {
          "type": "string",
          "description": "The name of the parameter."
        },
        "type": {
          "type": "string",
          "enum": [
            "string",
            "number",
            "boolean",
            "integer",
            "array"
          ]
        },
        "format": {
          "type": "string"
        },
        "items": {
          "$ref": "#/definitions/primitivesItems"
        },
        "collectionFormat": {
          "$ref": "#/definitions/collectionFormat"
        },
        "default": {
          "$ref": "#/definitions/default"
        },
        "maximum": {
          "$ref": "#/definitions/maximum"
        },
        "exclusiveMaximum": {
          "$ref": "#/definitions/exclusiveMaximum"
        },
        "minimum": {
          "$ref": "#/definitions/minimum"
        },
        "exclusiveMinimum": {
          "$ref": "#/definitions/exclusiveMinimum"
        },
        "maxLength": {
          "$ref": "#/definitions/maxLength"
        },
        "minLength": {
          "$ref": "#/definitions/minLength"
        },
        "pattern": {
          "$ref": "#/definitions/pattern"
        },
        "maxItems": {
          "$ref": "#/definitions/maxItems"
        },
        "minItems": {
          "$ref": "#/definitions/minItems"
        },
        "uniqueItems": {
          "$ref": "#/definitions/uniqueItems"
        },
        "enum": {
          "$ref": "#/definitions/enum"
        },
        "multipleOf": {
          "$ref": "#/definitions/multipleOf"
        }
      }
    },
    "nonBodyParameter": {
      "type": "object",
      "required": [
        "name",
        "in",
        "type"
      ],
      "oneOf": [
        {
          "$ref": "#/definitions/headerParameterSubSchema"
        },
        {
          "$ref": "#/definitions/formDataParameterSubSchema"
        },
        {
          "$ref": "#/definitions/queryParameterSubSchema"
        },
        {
          "$ref": "#/definitions/pathParameterSubSchema"
        }
      ]
    },
    "parameter": {
      "oneOf": [
        {
          "$ref": "#/definitions/bodyParameter"
        },
        {
          "$ref": "#/definitions/nonBodyParameter"
        }
      ]
    },
    "schema": {
      "type": "object",
      "description": "A deterministic version of a JSON Schema object.",
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      },
      "properties": {
        "$ref": {
          "type": "string"
        },
        "format": {
          "type": "string"
        },
        "title": {
          "$ref": "http://json-schema.org/draft-04/schema#/properties/title"
        },
        "description": {
          "$ref": "http://json-schema.org/draft-04/schema#/properties/description"
        },
        "default": {
          "$ref": "http://json-schema.org/draft-04/schema#/properties/default"
        },
        "multipleOf": {
          "$ref": "http://json-schema.org/draft-04/schema#/properties/multipleOf"
        },
        "maximum": {
          "$ref": "http://json-schema.org/draft-04/schema#/properties/maximum"
        },
        "exclusiveMaximum": {
          "$ref": "http://json-schema.org/draft-04/schema#/properties/exclusiveMaximum"
        },
        "minimum": {
          "$ref": "http://json-schema.org/draft-04/schema#/properties/minimum"
        },
        "exclusiveMinimum": {
          "$ref": "http://json-schema.org/draft-04/schema#/properties/exclusiveMinimum"
        },
        "maxLength": {
          "$ref": "http://json-schema.org/draft-04/schema#/definitions/positiveInteger"
        },
        "minLength": {
          "$ref": "http://json-schema.org/draft-04/schema#/definitions/positiveIntegerDefault0"
        },
        "pattern": {
          "$ref": "http://json-schema.org/draft-04/schema#/properties/pattern"
        },
        "maxItems": {
          "$ref": "http://json-schema.org/draft-04/schema#/definitions/positiveInteger"
        },
        "minItems": {
          "$ref": "http://json-schema.org/draft-04/schema#/definitions/positiveIntegerDefault0"
        },
        "uniqueItems": {
          "$ref": "http://json-schema.org/draft-04/schema#/properties/uniqueItems"
        },
        "maxProperties": {
          "$ref": "http://json-schema.org/draft-04/schema#/definitions/positiveInteger"
        },
        "minProperties": {
          "$ref": "http://json-schema.org/draft-04/schema#/definitions/positiveIntegerDefault0"
        },
        "required": {
          "$ref": "http://json-schema.org/draft-04/schema#/definitions/stringArray"
        },
        "enum": {
          "$ref": "http://json-schema.org/draft-04/schema#/properties/enum"
        },
        "type": {
          "$ref": "http://json-schema.org/draft-04/schema#/properties/type"
        },
        "items": {
          "anyOf": [
            {
              "$ref": "#/definitions/schema"
            },
            {
              "type": "array",
              "minItems": 1,
              "items": {
                "$ref": "#/definitions/schema"
              }
            }
          ],
          "default": {}
        },
        "allOf": {
          "type": "array",
          "minItems": 1,
          "items": {
            "$ref": "#/definitions/schema"
          }
        },
        "properties": {
          "type": "object",
          "additionalProperties": {
            "$ref": "#/definitions/schema"
          },
          "default": {}
        },
        "discriminator": {
          "type": "string"
        },
        "readOnly": {
          "type": "boolean",
          "default": false
        },
        "xml": {
          "$ref": "#/definitions/xml"
        },
        "externalDocs": {
          "$ref": "#/definitions/externalDocs"
        },
        "example": {}
      }
    },
    "primitivesItems": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "type": {
          "type": "string",
          "enum": [
            "string",
            "number",
            "integer",
            "boolean",
            "array"
          ]
        },
        "format": {
          "type": "string"
        },
        "items": {
          "$ref": "#/definitions/primitivesItems"
        },
        "collectionFormat": {
          "$ref": "#/definitions/collectionFormat"
        },
        "default": {
          "$ref": "#/definitions/default"
        },
        "maximum": {
          "$ref": "#/definitions/maximum"
        },
        "exclusiveMaximum": {
          "$ref": "#/definitions/exclusiveMaximum"
        },
        "minimum": {
          "$ref": "#/definitions/minimum"
        },
        "exclusiveMinimum": {
          "$ref": "#/definitions/exclusiveMinimum"
        },
        "maxLength": {
          "$ref": "#/definitions/maxLength"
        },
        "minLength": {
          "$ref": "#/definitions/minLength"
        },
        "pattern": {
          "$ref": "#/definitions/pattern"
        },
        "maxItems": {
          "$ref": "#/definitions/maxItems"
        },
        "minItems": {
          "$ref": "#/definitions/minItems"
        },
        "uniqueItems": {
          "$ref": "#/definitions/uniqueItems"
        },
        "enum": {
          "$ref": "#/definitions/enum"
        },
        "multipleOf": {
          "$ref": "#/definitions/multipleOf"
        }
      }
    },
    "security": {
      "type": "array",
      "items": {
        "$ref": "#/definitions/securityRequirement"
      },
      "uniqueItems": true
    },
    "securityRequirement": {
      "type": "object",
      "additionalProperties": {
        "type": "array",
        "items": {
          "type": "string"
        },
        "uniqueItems": true
      }
    },
    "xml": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "name": {
          "type": "string"
        },
        "namespace": {
          "type": "string"
        },
        "prefix": {
          "type": "string"
        },
        "attribute": {
          "type": "boolean",
          "default": false
        },
        "wrapped": {
          "type": "boolean",
          "default": false
        }
      }
    },
    "tag": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "name"
      ],
      "properties": {
        "name": {
          "type": "string"
        },
        "description": {
          "type": "string"
        },
        "externalDocs": {
          "$ref": "#/definitions/externalDocs"
        }
      },
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      }
    },
    "securityDefinitions": {
      "type": "object",
      "additionalProperties": {
        "oneOf": [
          {
            "$ref": "#/definitions/basicAuthenticationSecurity"
          },
          {
            "$ref": "#/definitions/apiKeySecurity"
          },
          {
            "$ref": "#/definitions/oauth2ImplicitSecurity"
          },
          {
            "$ref": "#/definitions/oauth2PasswordSecurity"
          },
          {
            "$ref": "#/definitions/oauth2ApplicationSecurity"
          },
          {
            "$ref": "#/definitions/oauth2AccessCodeSecurity"
          }
        ]
      }
    },
    "basicAuthenticationSecurity": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "type"
      ],
      "properties": {
        "type": {
          "type": "string",
          "enum": [
            "basic"
          ]
        },
        "description": {
          "type": "string"
        }
      },
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      }
    },
    "apiKeySecurity": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "type",
        "name",
        "in"
      ],
      "properties": {
        "type": {
          "type": "string",
          "enum": [
            "apiKey"
          ]
        },
        "name": {
          "type": "string"
        },
        "in": {
          "type": "string",
          "enum": [
            "header",
            "query"
          ]
        },
        "description": {
          "type": "string"
        }
      },
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      }
    },
    "oauth2ImplicitSecurity": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "type",
        "flow",
        "authorizationUrl"
      ],
      "properties": {
        "type": {
          "type": "string",
          "enum": [
            "oauth2"
          ]
        },
        "flow": {
          "type": "string",
          "enum": [
            "implicit"
          ]
        },
        "scopes": {
          "$ref": "#/definitions/oauth2Scopes"
        },
        "authorizationUrl": {
          "type": "string",
          "format": "uri"
        },
        "description": {
          "type": "string"
        }
      },
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      }
    },
    "oauth2PasswordSecurity": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "type",
        "flow",
        "tokenUrl"
      ],
      "properties": {
        "type": {
          "type": "string",
          "enum": [
            "oauth2"
          ]
        },
        "flow": {
          "type": "string",
          "enum": [
            "password"
          ]
        },
        "scopes": {
          "$ref": "#/definitions/oauth2Scopes"
        },
        "tokenUrl": {
          "type": "string",
          "format": "uri"
        },
        "description": {
          "type": "string"
        }
      },
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      }
    },
    "oauth2ApplicationSecurity": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "type",
        "flow",
        "tokenUrl"
      ],
      "properties": {
        "type": {
          "type": "string",
          "enum": [
            "oauth2"
          ]
        },
        "flow": {
          "type": "string",
          "enum": [
            "application"
          ]
        },
        "scopes": {
          "$ref": "#/definitions/oauth2Scopes"
        },
        "tokenUrl": {
          "type": "string",
          "format": "uri"
        },
        "description": {
          "type": "string"
        }
      },
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      }
    },
    "oauth2AccessCodeSecurity": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "type",
        "flow",
        "authorizationUrl",
        "tokenUrl"
      ],
      "properties": {
        "type": {
          "type": "string",
          "enum": [
            "oauth2"
          ]
        },
        "flow": {
          "type": "string",
          "enum": [
            "accessCode"
          ]
        },
        "scopes": {
          "$ref": "#/definitions/oauth2Scopes"
        },
        "authorizationUrl": {
          "type": "string",
          "format": "uri"
        },
        "tokenUrl": {
          "type": "string",
          "format": "uri"
        },
        "description": {
          "type": "string"
        }
      },
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      }
    },
    "oauth2Scopes": {
      "type": "object",
      "additionalProperties": {
        "type": "string"
      }
    },
    "mediaTypeList": {
      "type": "array",
      "items": {
        "$ref": "#/definitions/mimeType"
      },
      "uniqueItems": true
    },
    "parametersList": {
      "type": "array",
      "description": "The parameters needed to send a valid API call.",
      "minItems": 1,
      "additionalItems": false,
      "items": {
        "oneOf": [
          {
            "$ref": "#/definitions/parameter"
          },
          {
            "$ref": "#/definitions/jsonReference"
          }
        ]
      },
      "uniqueItems": true
    },
    "schemesList": {
      "type": "array",
      "description": "The transfer protocol of the API.",
      "items": {
        "type": "string",
        "enum": [
          "http",
          "https",
          "ws",
          "wss"
        ]
      },
      "uniqueItems": true
    },
    "collectionFormat": {
      "type": "string",
      "enum": [
        "csv",
        "ssv",
        "tsv",
        "pipes"
      ],
      "default": "csv"
    },
    "collectionFormatWithMulti": {
      "type": "string",
      "enum": [
        "csv",
        "ssv",
        "tsv",
        "pipes",
        "multi"
      ],
      "default": "csv"
    },
    "title": {
      "$ref": "http://json-schema.org/draft-04/schema#/properties/title"
    },
    "description": {
      "$ref": "http://json-schema.org/draft-04/schema#/properties/description"
    },
    "default": {
      "$ref": "http://json-schema.org/draft-04/schema#/properties/default"
    },
    "multipleOf": {
      "$ref": "http://json-schema.org/draft-04/schema#/properties/multipleOf"
    },
    "maximum": {
      "$ref": "http://json-schema.org/draft-04/schema#/properties/maximum"
    },
    "exclusiveMaximum": {
      "$ref": "http://json-schema.org/draft-04/schema#/properties/exclusiveMaximum"
    },
    "minimum": {
      "$ref": "http://json-schema.org/draft-04/schema#/properties/minimum"
    },
    "exclusiveMinimum": {
      "$ref": "http://json-schema.org/draft-04/schema#/properties/exclusiveMinimum"
    },
    "maxLength": {
      "$ref": "http://json-schema.org/draft-04/schema#/definitions/positiveInteger"
    },
    "minLength": {
      "$ref": "http://json-schema.org/draft-04/schema#/definitions/positiveIntegerDefault0"
    },
    "pattern": {
      "$ref": "http://json-schema.org/draft-04/schema#/properties/pattern"
    },
    "maxItems": {
      "$ref": "http://json-schema.org/draft-04/schema#/definitions/positiveInteger"
    },
    "minItems": {
      "$ref": "http://json-schema.org/draft-04/schema#/definitions/positiveIntegerDefault0"
    },
    "uniqueItems": {
      "$ref": "http://json-schema.org/draft-04/schema#/properties/uniqueItems"
    },
    "enum": {
      "$ref": "http://json-schema.org/draft-04/schema#/properties/enum"
    },
    "jsonReference": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "$ref": {
          "type": "string"
        }
      }
    }
  }
}

},{}],87:[function(require,module,exports){
module.exports={
    "id": "http://json-schema.org/draft-04/schema#",
    "$schema": "http://json-schema.org/draft-04/schema#",
    "description": "Core schema meta-schema",
    "definitions": {
        "schemaArray": {
            "type": "array",
            "minItems": 1,
            "items": { "$ref": "#" }
        },
        "positiveInteger": {
            "type": "integer",
            "minimum": 0
        },
        "positiveIntegerDefault0": {
            "allOf": [ { "$ref": "#/definitions/positiveInteger" }, { "default": 0 } ]
        },
        "simpleTypes": {
            "enum": [ "array", "boolean", "integer", "null", "number", "object", "string" ]
        },
        "stringArray": {
            "type": "array",
            "items": { "type": "string" },
            "minItems": 1,
            "uniqueItems": true
        }
    },
    "type": "object",
    "properties": {
        "id": {
            "type": "string",
            "format": "uri"
        },
        "$schema": {
            "type": "string",
            "format": "uri"
        },
        "title": {
            "type": "string"
        },
        "description": {
            "type": "string"
        },
        "default": {},
        "multipleOf": {
            "type": "number",
            "minimum": 0,
            "exclusiveMinimum": true
        },
        "maximum": {
            "type": "number"
        },
        "exclusiveMaximum": {
            "type": "boolean",
            "default": false
        },
        "minimum": {
            "type": "number"
        },
        "exclusiveMinimum": {
            "type": "boolean",
            "default": false
        },
        "maxLength": { "$ref": "#/definitions/positiveInteger" },
        "minLength": { "$ref": "#/definitions/positiveIntegerDefault0" },
        "pattern": {
            "type": "string",
            "format": "regex"
        },
        "additionalItems": {
            "anyOf": [
                { "type": "boolean" },
                { "$ref": "#" }
            ],
            "default": {}
        },
        "items": {
            "anyOf": [
                { "$ref": "#" },
                { "$ref": "#/definitions/schemaArray" }
            ],
            "default": {}
        },
        "maxItems": { "$ref": "#/definitions/positiveInteger" },
        "minItems": { "$ref": "#/definitions/positiveIntegerDefault0" },
        "uniqueItems": {
            "type": "boolean",
            "default": false
        },
        "maxProperties": { "$ref": "#/definitions/positiveInteger" },
        "minProperties": { "$ref": "#/definitions/positiveIntegerDefault0" },
        "required": { "$ref": "#/definitions/stringArray" },
        "additionalProperties": {
            "anyOf": [
                { "type": "boolean" },
                { "$ref": "#" }
            ],
            "default": {}
        },
        "definitions": {
            "type": "object",
            "additionalProperties": { "$ref": "#" },
            "default": {}
        },
        "properties": {
            "type": "object",
            "additionalProperties": { "$ref": "#" },
            "default": {}
        },
        "patternProperties": {
            "type": "object",
            "additionalProperties": { "$ref": "#" },
            "default": {}
        },
        "dependencies": {
            "type": "object",
            "additionalProperties": {
                "anyOf": [
                    { "$ref": "#" },
                    { "$ref": "#/definitions/stringArray" }
                ]
            }
        },
        "enum": {
            "type": "array",
            "minItems": 1,
            "uniqueItems": true
        },
        "type": {
            "anyOf": [
                { "$ref": "#/definitions/simpleTypes" },
                {
                    "type": "array",
                    "items": { "$ref": "#/definitions/simpleTypes" },
                    "minItems": 1,
                    "uniqueItems": true
                }
            ]
        },
        "allOf": { "$ref": "#/definitions/schemaArray" },
        "anyOf": { "$ref": "#/definitions/schemaArray" },
        "oneOf": { "$ref": "#/definitions/schemaArray" },
        "not": { "$ref": "#" }
    },
    "dependencies": {
        "exclusiveMaximum": [ "maximum" ],
        "exclusiveMinimum": [ "minimum" ]
    },
    "default": {}
}

},{}]},{},[1])(1)
});