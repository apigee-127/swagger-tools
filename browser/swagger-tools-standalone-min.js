!function(e){if("object"==typeof exports&&"undefined"!=typeof module)module.exports=e();else if("function"==typeof define&&define.amd)define([],e);else{var o;"undefined"!=typeof window?o=window:"undefined"!=typeof global?o=global:"undefined"!=typeof self&&(o=self),(o.SwaggerTools||(o.SwaggerTools={})).specs=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
(function(e){"use strict";var r=require("lodash"),n=require("async"),i=require("./helpers"),t=require("json-refs"),o=require("spark-md5"),s=require("swagger-converter"),a=require("traverse"),c=require("./validators");r.isPlainObject(s)&&(s=e.SwaggerConverter.convert);var u={},d=r.map(i.swaggerOperationMethods,function(e){return e.toLowerCase()}),f=function _(e,i,o){var s=r.reduce(t.findRefs(i),function(e,r,n){return t.isRemotePointer(n)&&e.push(r.split("#")[0]),e},[]),a=function(r,n){t.resolveRefs({$ref:r},function(r,i){return r?n(r):void _(e,i,function(e,r){n(e,r)})})};s.length>0?n.map(s,a,function(n,i){return n?o(n):(r.each(i,function(r,n){e.setRemoteReference(s[n],r)}),void o())}):o()},h=function(e,r,n,i){i.push({code:e,message:r,path:n})},p=function(e,n,o,s,a){var c,u,d,f,p,l=!0,g=i.getSwaggerVersion(e.resolved),m=r.isArray(n)?n:t.pathFromPointer(n),v=r.isArray(n)?t.pathToPointer(n):n,w=r.isArray(o)?o:t.pathFromPointer(o),b=r.isArray(o)?t.pathToPointer(o):o;return 0===m.length?(h("INVALID_REFERENCE","Not a valid JSON Reference",w,s.errors),!1):(u=e.definitions[v],p=m[0],c="securityDefinitions"===p?"SECURITY_DEFINITION":p.substring(0,p.length-1).toUpperCase(),d="1.2"===g?m[m.length-1]:v,f="securityDefinitions"===p?"Security definition":c.charAt(0)+c.substring(1).toLowerCase(),["authorizations","securityDefinitions"].indexOf(m[0])>-1&&"scopes"===m[2]&&(c+="_SCOPE",f+=" scope"),r.isUndefined(u)?(a||h("UNRESOLVABLE_"+c,f+" could not be resolved: "+d,w,s.errors),l=!1):(r.isUndefined(u.references)&&(u.references=[]),u.references.push(b)),l)},l=function q(e,n){var i,o,s="Composed "+("1.2"===e.swaggerVersion?t.pathFromPointer(n).pop():n),c=e.definitions[n],u=a(e.original),d=a(e.resolved);return c?(o=r.cloneDeep(u.get(t.pathFromPointer(n))),i=r.cloneDeep(d.get(t.pathFromPointer(n))),"1.2"===e.swaggerVersion&&(c.lineage.length>0&&(i.allOf=[],r.each(c.lineage,function(r){i.allOf.push(q(e,r))})),delete i.subTypes,r.each(i.properties,function(n,i){var s=o.properties[i];r.each(["maximum","minimum"],function(e){r.isString(n[e])&&(n[e]=parseFloat(n[e]))}),r.each(t.findRefs(s),function(r,i){var o="#/models/"+r,s=e.definitions[o],c=t.pathFromPointer(i);s.lineage.length>0?a(n).set(c.slice(0,c.length-1),q(e,o)):a(n).set(c.slice(0,c.length-1).concat("title"),"Composed "+r)})})),i=a(i).map(function(e){"id"===this.key&&r.isString(e)&&this.remove()}),i.title=s,i):void 0},g=function(e,r,n,i,t){h("UNUSED_"+r,n+" is defined but is not used: "+e,i,t)},m=function(e){var n=o.hash(JSON.stringify(e)),t=u[n]||r.find(u,function(e){return e.resolvedId===n});return t||(t=u[n]={definitions:{},original:e,resolved:void 0,swaggerVersion:i.getSwaggerVersion(e)}),t},v=function(e,r){var n=new Error("The Swagger document(s) are invalid");n.errors=e.errors,n.failedValidation=!0,n.warnings=e.warnings,e.apiDeclarations&&(n.apiDeclarations=e.apiDeclarations),r(n)},w=function(e){var n=e.match(/\{(.*?)\}/g),i=[],t=e;return n&&r.each(n,function(e,r){t=t.replace(e,"{"+r+"}"),i.push(e.replace(/[{}]/g,""))}),{path:t,args:i}},b=function(e,n,i,t,o,s){!r.isUndefined(e)&&e.indexOf(n)>-1&&h("DUPLICATE_"+i,t+" already defined: "+n,o,s)},E=function(e,r,n,i,t){try{c.validateSchemaConstraints(e.swaggerVersion,r,n,void 0)}catch(o){t||h(o.code,o.message,o.path,i.errors)}},j=function(e,n){var i=e.swaggerVersion,o=function(r){var n=t.pathToPointer(r),i=e.definitions[n];return i||(i=e.definitions[n]={references:[]},["definitions","models"].indexOf(t.pathFromPointer(n)[0])>-1&&(i.cyclical=!1,i.lineage=void 0,i.parents=[])),i},s=function(e){return"1.2"===i?t.pathFromPointer(e).pop():e},c=function f(n,i,t){var o=e.definitions[i||n];o&&r.each(o.parents,function(e){t.push(e),n!==e&&f(n,e,t)})},u="1.2"===i?"authorizations":"securityDefinitions",d="1.2"===i?"models":"definitions";switch(r.each(e.resolved[u],function(e,t){var s=[u,t];("1.2"!==i||e.type)&&(o(s),r.reduce(e.scopes,function(e,r,t){var a="1.2"===i?r.scope:t,c=s.concat(["scopes",t.toString()]),u=o(s.concat(["scopes",a]));return u.scopePath=c,b(e,a,"AUTHORIZATION_SCOPE_DEFINITION","Authorization scope definition","1.2"===i?c.concat("scope"):c,n.warnings),e.push(a),e},[]))}),r.each(e.resolved[d],function(s,c){var u=[d,c],f=o(u);if("1.2"===i&&c!==s.id&&h("MODEL_ID_MISMATCH","Model id does not match id in models object: "+s.id,u.concat("id"),n.errors),r.isUndefined(f.lineage))switch(i){case"1.2":r.each(s.subTypes,function(r,i){var s=["models",r],a=t.pathToPointer(s),c=e.definitions[a],f=u.concat(["subTypes",i.toString()]);!c&&e.resolved[d][r]&&(c=o(s)),p(e,s,f,n)&&c.parents.push(t.pathToPointer(u))});break;default:r.each(e.original[d][c].allOf,function(n,i){var s,c=u.concat(["allOf",i.toString()]);r.isUndefined(n.$ref)||t.isRemotePointer(n.$ref)?s=u.concat(["allOf",i.toString()]):(c.push("$ref"),s=t.pathFromPointer(n.$ref)),r.isUndefined(a(e.resolved).get(s))||(o(t.pathFromPointer(n.$ref)),f.parents.push(t.pathToPointer(s)))})}}),i){case"2.0":r.each(e.resolved.parameters,function(r,i){var t=["parameters",i];o(t),E(e,r,t,n)}),r.each(e.resolved.responses,function(r,i){var t=["responses",i];o(t),E(e,r,t,n)})}r.each(e.definitions,function(o,u){var d,f,p,l=t.pathFromPointer(u),g=a(e.original).get(l),m=l[0],v=m.substring(0,m.length-1).toUpperCase(),w=v.charAt(0)+v.substring(1).toLowerCase();-1!==["definitions","models"].indexOf(m)&&(d=[],f=[],p=o.lineage,r.isUndefined(p)&&(p=[],c(u,void 0,p),p.reverse(),o.lineage=r.cloneDeep(p),o.cyclical=p.length>1&&p[0]===u),o.parents.length>1&&"1.2"===i&&h("MULTIPLE_"+v+"_INHERITANCE","Child "+v.toLowerCase()+" is sub type of multiple models: "+r.map(o.parents,function(e){return s(e)}).join(" && "),l,n.errors),o.cyclical&&h("CYCLICAL_"+v+"_INHERITANCE",w+" has a circular inheritance: "+r.map(p,function(e){return s(e)}).join(" -> ")+" -> "+s(u),l.concat("1.2"===i?"subTypes":"allOf"),n.errors),r.each(p.slice(o.cyclical?1:0),function(n){var i=a(e.resolved).get(t.pathFromPointer(n));r.each(Object.keys(i.properties),function(e){-1===f.indexOf(e)&&f.push(e)})}),E(e,g,l,n),r.each(g.properties,function(i,t){var o=l.concat(["properties",t]);r.isUndefined(i)||(E(e,i,o,n),f.indexOf(t)>-1?h("CHILD_"+v+"_REDECLARES_PROPERTY","Child "+v.toLowerCase()+" declares property already declared by ancestor: "+t,o,n.errors):d.push(t))}),r.each(g.required||[],function(e,r){var t="1.2"===i?"Model":"Definition";-1===f.indexOf(e)&&-1===d.indexOf(e)&&h("MISSING_REQUIRED_"+t.toUpperCase()+"_PROPERTY",t+" requires property but it is not defined: "+e,l.concat(["required",r.toString()]),n.errors)}))}),r.each(t.findRefs(e.original),function(r,i){"1.2"===e.swaggerVersion&&(r="#/models/"+r),t.isRemotePointer(r)||p(e,r,i,n)})},O=function(e,n,i,t,o,s){r.isUndefined(e)||-1!==e.indexOf(n)||h("UNRESOLVABLE_"+i,t+" could not be resolved: "+n,o,s)},y=function(e,n,i,t){var o="1.2"===e.swaggerVersion?"AUTHORIZATION":"SECURITY_DEFINITION",s="AUTHORIZATION"===o?"Authorization":"Security definition";"1.2"===e.swaggerVersion?r.reduce(n,function(n,a,c){var u="#/authorizations/"+c,d=i.concat([c]);return p(e,u,d,t)&&r.reduce(a,function(r,n,i){var a=d.concat(i.toString(),"scope"),c=u+"/scopes/"+n.scope;return b(r,n.scope,o+"_SCOPE_REFERENCE",s+" scope reference",a,t.warnings),p(e,c,a,t),r.concat(n.scope)},[]),n.concat(c)},[]):r.reduce(n,function(n,a,c){return r.each(a,function(a,u){var d="#/securityDefinitions/"+u,f=i.concat(c.toString(),u);b(n,u,o+"_REFERENCE",s+" reference",f,t.warnings),n.push(u),p(e,d,f,t)&&r.each(a,function(r,n){p(e,d+"/scopes/"+r,f.concat(n.toString()),t)})}),n},[])},P=function(e,n){var s,c=m(e),u=i.getSwaggerVersion(e);c.resolved?n():("1.2"===u&&(e=r.cloneDeep(e),s=a(e),r.each(t.findRefs(e),function(e,r){s.set(t.pathFromPointer(r),"#/models/"+e)})),t.resolveRefs(e,function(e,r){return e?n(e):(c.resolved=r,c.resolvedId=o.hash(JSON.stringify(r)),void n())}))},T=function(e,n,t,o){var s=r.isString(n)?e.validators[n]:i.createJsonValidator(),a=function(){try{c.validateAgainstSchema(n,t,s)}catch(e){return e.failedValidation?o(void 0,e.results):o(e)}P(t,function(e){return o(e)})};f(s,t,function(e){return e?o(e):void a()})},S=function(e,n){r.each(e.definitions,function(r,i){var o=t.pathFromPointer(i),s=o[0].substring(0,o[0].length-1),a="1.2"===e.swaggerVersion?o[o.length-1]:i,c="securityDefinition"===s?"SECURITY_DEFINITION":s.toUpperCase(),u="securityDefinition"===s?"Security definition":s.charAt(0).toUpperCase()+s.substring(1);0===r.references.length&&(r.scopePath&&(c+="_SCOPE",u+=" scope",o=r.scopePath),g(a,c,u,o,n.warnings))})},R=function(e,n,i,t,o,s,a){var c=[];r.reduce(t,function(e,t,a){var u=o.concat(["parameters",a.toString()]);if(!r.isUndefined(t))return b(e,t.name,"PARAMETER","Parameter",u.concat("name"),s.errors),("path"===t.paramType||"path"===t["in"])&&(-1===i.args.indexOf(t.name)&&h("UNRESOLVABLE_API_PATH_PARAMETER","API path parameter could not be resolved: "+t.name,u.concat("name"),s.errors),c.push(t.name)),E(n,t,u,s,t.skipErrors),e.concat(t.name)},[]),(r.isUndefined(a)||a===!1)&&r.each(r.difference(i.args,c),function(e){h("MISSING_API_PATH_PARAMETER","API requires path parameter but it is not defined: "+e,"1.2"===n.swaggerVersion?o.slice(0,2).concat("path"):o,s.errors)})},U=function(e,n,i,t){var o=[],s=m(n),a=[],c={errors:[],warnings:[],apiDeclarations:[]};a=r.reduce(n.apis,function(e,r,n){return b(e,r.path,"RESOURCE_PATH","Resource path",["apis",n.toString(),"path"],c.errors),e.push(r.path),e},[]),j(s,c),o=r.reduce(i,function(n,i,t){var u=c.apiDeclarations[t]={errors:[],warnings:[]},d=m(i);return b(n,i.resourcePath,"RESOURCE_PATH","Resource path",["resourcePath"],u.errors),-1===o.indexOf(i.resourcePath)&&(O(a,i.resourcePath,"RESOURCE_PATH","Resource path",["resourcePath"],u.errors),n.push(i.resourcePath)),j(d,u),r.reduce(i.apis,function(n,i,t){var o=["apis",t.toString()],a=w(i.path);return n.indexOf(a.path)>-1?h("DUPLICATE_API_PATH","API path (or equivalent) already defined: "+i.path,o.concat("path"),u.errors):n.push(a.path),r.reduce(i.operations,function(n,i,t){var c=o.concat(["operations",t.toString()]);return b(n,i.method,"OPERATION_METHOD","Operation method",c.concat("method"),u.errors),n.push(i.method),-1===e.primitives.indexOf(i.type)&&"1.2"===e.version&&p(d,"#/models/"+i.type,c.concat("type"),u),y(s,i.authorizations,c.concat("authorizations"),u),E(d,i,c,u),R(e,d,a,i.parameters,c,u),r.reduce(i.responseMessages,function(e,r,n){var i=c.concat(["responseMessages",n.toString()]);return b(e,r.code,"RESPONSE_MESSAGE_CODE","Response message code",i.concat(["code"]),u.errors),r.responseModel&&p(d,"#/models/"+r.responseModel,i.concat("responseModel"),u),e.concat(r.code)},[]),n},[]),n},[]),S(d,u),n},[]),S(s,c),r.each(r.difference(a,o),function(e){var r=a.indexOf(e);g(n.apis[r].path,"RESOURCE_PATH","Resource path",["apis",r.toString(),"path"],c.errors)}),t(void 0,c)},A=function(e,n,i){var t=m(n),o={errors:[],warnings:[]};j(t,o),y(t,n.security,["security"],o),r.reduce(t.resolved.paths,function(n,i,s){var a=["paths",s],c=w(s);return n.indexOf(c.path)>-1&&h("DUPLICATE_API_PATH","API path (or equivalent) already defined: "+s,a,o.errors),R(e,t,c,i.parameters,a,o,!0),r.each(i,function(n,s){var u=[],f=a.concat(s),h=[];-1!==d.indexOf(s)&&(y(t,n.security,f.concat("security"),o),r.each(n.parameters,function(e){u.push(e),h.push(e.name+":"+e["in"])}),r.each(i.parameters,function(e){var n=r.cloneDeep(e);n.skipErrors=!0,-1===h.indexOf(e.name+":"+e["in"])&&u.push(n)}),R(e,t,c,u,f,o),r.each(n.responses,function(e,n){r.isUndefined(e)||E(t,e,f.concat("responses",n),o)}))}),n.concat(c.path)},[]),S(t,o),i(void 0,o)},I=function(e,r,n,t){var o=function(e,r){t(e,i.formatResults(r))};"1.2"===e.version?U(e,r,n,o):A(e,r,o)},D=function(e,i,t,o){T(e,"1.2"===e.version?"resourceListing.json":"schema.json",i,function(i,s){return i?o(i):void(s||"1.2"!==e.version?o(void 0,s):(s={errors:[],warnings:[],apiDeclarations:[]},n.map(t,function(r,n){T(e,"apiDeclaration.json",r,n)},function(e,n){return e?o(e):(r.each(n,function(e,r){s.apiDeclarations[r]=e}),void o(void 0,s))})))})},C=function(e){var n=function(e,n){return r.reduce(n,function(e,r,n){return e[n]=i.createJsonValidator(r),e}.bind(this),{})},t=function(e){var n=r.cloneDeep(this.schemas[e]);return n.id=e,n}.bind(this),o=["string","number","boolean","integer","array"];switch(e){case"1.2":this.docsUrl="https://github.com/swagger-api/swagger-spec/blob/master/versions/1.2.md",this.primitives=r.union(o,["void","File"]),this.schemasUrl="https://github.com/swagger-api/swagger-spec/tree/master/schemas/v1.2",this.schemas={"apiDeclaration.json":require("../schemas/1.2/apiDeclaration.json"),"authorizationObject.json":require("../schemas/1.2/authorizationObject.json"),"dataType.json":require("../schemas/1.2/dataType.json"),"dataTypeBase.json":require("../schemas/1.2/dataTypeBase.json"),"infoObject.json":require("../schemas/1.2/infoObject.json"),"modelsObject.json":require("../schemas/1.2/modelsObject.json"),"oauth2GrantType.json":require("../schemas/1.2/oauth2GrantType.json"),"operationObject.json":require("../schemas/1.2/operationObject.json"),"parameterObject.json":require("../schemas/1.2/parameterObject.json"),"resourceListing.json":require("../schemas/1.2/resourceListing.json"),"resourceObject.json":require("../schemas/1.2/resourceObject.json")},this.validators=n(this,{"apiDeclaration.json":r.map(["dataTypeBase.json","modelsObject.json","oauth2GrantType.json","authorizationObject.json","parameterObject.json","operationObject.json","apiDeclaration.json"],t),"resourceListing.json":r.map(["resourceObject.json","infoObject.json","oauth2GrantType.json","authorizationObject.json","resourceListing.json"],t)});break;case"2.0":this.docsUrl="https://github.com/swagger-api/swagger-spec/blob/master/versions/2.0.md",this.primitives=r.union(o,["file"]),this.schemasUrl="https://github.com/swagger-api/swagger-spec/tree/master/schemas/v2.0",this.schemas={"schema.json":require("../schemas/2.0/schema.json")},this.validators=n(this,{"schema.json":[t("schema.json")]});break;default:throw new Error(e+" is an unsupported Swagger specification version")}this.version=e};C.prototype.validate=function(e,n,t){switch(this.version){case"1.2":if(r.isUndefined(e))throw new Error("resourceListing is required");if(!r.isPlainObject(e))throw new TypeError("resourceListing must be an object");if(r.isUndefined(n))throw new Error("apiDeclarations is required");if(!r.isArray(n))throw new TypeError("apiDeclarations must be an array");break;case"2.0":if(r.isUndefined(e))throw new Error("swaggerObject is required");if(!r.isPlainObject(e))throw new TypeError("swaggerObject must be an object")}if("2.0"===this.version&&(t=arguments[1]),r.isUndefined(t))throw new Error("callback is required");if(!r.isFunction(t))throw new TypeError("callback must be a function");"2.0"===this.version&&(n=[]),D(this,e,n,function(r,o){r||i.formatResults(o)?t(r,o):I(this,e,n,t)}.bind(this))},C.prototype.composeModel=function(e,n,t){var o=i.getSwaggerVersion(e),s=function(r,o){var s;return r?t(r):i.getErrorCount(o)>0?v(o,t):(s=m(e),o={errors:[],warnings:[]},j(s,o),s.definitions[n]?i.getErrorCount(o)>0?v(o,t):void t(void 0,l(s,n)):t())};switch(this.version){case"1.2":if(r.isUndefined(e))throw new Error("apiDeclaration is required");if(!r.isPlainObject(e))throw new TypeError("apiDeclaration must be an object");if(r.isUndefined(n))throw new Error("modelId is required");break;case"2.0":if(r.isUndefined(e))throw new Error("swaggerObject is required");if(!r.isPlainObject(e))throw new TypeError("swaggerObject must be an object");if(r.isUndefined(n))throw new Error("modelRef is required")}if(r.isUndefined(t))throw new Error("callback is required");if(!r.isFunction(t))throw new TypeError("callback must be a function");if("#"!==n.charAt(0)){if("1.2"!==this.version)throw new Error("modelRef must be a JSON Pointer");n="#/models/"+n}"1.2"===o?T(this,"apiDeclaration.json",e,s):this.validate(e,s)},C.prototype.validateModel=function(e,n,i,t){switch(this.version){case"1.2":if(r.isUndefined(e))throw new Error("apiDeclaration is required");if(!r.isPlainObject(e))throw new TypeError("apiDeclaration must be an object");if(r.isUndefined(n))throw new Error("modelId is required");break;case"2.0":if(r.isUndefined(e))throw new Error("swaggerObject is required");if(!r.isPlainObject(e))throw new TypeError("swaggerObject must be an object");if(r.isUndefined(n))throw new Error("modelRef is required")}if(r.isUndefined(i))throw new Error("data is required");if(r.isUndefined(t))throw new Error("callback is required");if(!r.isFunction(t))throw new TypeError("callback must be a function");this.composeModel(e,n,function(e,r){return e?t(e):void T(this,r,i,t)}.bind(this))},C.prototype.resolve=function(e,n,o){var s,c,u=function(e){return r.isString(n)?o(void 0,a(e).get(t.pathFromPointer(n))):o(void 0,e)};if(r.isUndefined(e))throw new Error("document is required");if(!r.isPlainObject(e))throw new TypeError("document must be an object");if(2===arguments.length&&(o=arguments[1],n=void 0),!r.isUndefined(n)&&!r.isString(n))throw new TypeError("ptr must be a JSON Pointer string");if(r.isUndefined(o))throw new Error("callback is required");if(!r.isFunction(o))throw new TypeError("callback must be a function");if(s=m(e),"1.2"===s.swaggerVersion)throw new Error("Swagger 1.2 is not supported");return s.resolved?u(s.resolved):(c="1.2"===s.swaggerVersion?r.find(["basePath","consumes","models","produces","resourcePath"],function(n){return!r.isUndefined(e[n])})?"apiDeclaration.json":"resourceListing.json":"schema.json",void this.validate(e,function(e,r){return e?o(e):i.getErrorCount(r)>0?v(r,o):u(s.resolved)}))},C.prototype.convert=function(e,n,t,o){var a=function(e,r){o(void 0,s(e,r))}.bind(this);if("1.2"!==this.version)throw new Error("Specification#convert only works for Swagger 1.2");if(r.isUndefined(e))throw new Error("resourceListing is required");if(!r.isPlainObject(e))throw new TypeError("resourceListing must be an object");if(r.isUndefined(n)&&(n=[]),!r.isArray(n))throw new TypeError("apiDeclarations must be an array");if(arguments.length<4&&(o=arguments[arguments.length-1]),r.isUndefined(o))throw new Error("callback is required");if(!r.isFunction(o))throw new TypeError("callback must be a function");t===!0?a(e,n):this.validate(e,n,function(r,t){return r?o(r):i.getErrorCount(t)>0?v(t,o):void a(e,n)})},module.exports.v1=module.exports.v1_2=new C("1.2"),module.exports.v2=module.exports.v2_0=new C("2.0")}).call(this,"undefined"!=typeof global?global:"undefined"!=typeof self?self:"undefined"!=typeof window?window:{});
},{"../schemas/1.2/apiDeclaration.json":29,"../schemas/1.2/authorizationObject.json":30,"../schemas/1.2/dataType.json":31,"../schemas/1.2/dataTypeBase.json":32,"../schemas/1.2/infoObject.json":33,"../schemas/1.2/modelsObject.json":34,"../schemas/1.2/oauth2GrantType.json":35,"../schemas/1.2/operationObject.json":36,"../schemas/1.2/parameterObject.json":37,"../schemas/1.2/resourceListing.json":38,"../schemas/1.2/resourceObject.json":39,"../schemas/2.0/schema.json":40,"./helpers":2,"./validators":3,"async":4,"json-refs":11,"lodash":15,"spark-md5":16,"swagger-converter":17,"traverse":18}],2:[function(require,module,exports){
(function(r){"use strict";var e=require("lodash"),n=require("json-refs"),o=require("z-schema"),t=require("../schemas/json-schema-draft-04.json"),a="http://json-schema.org/draft-04/schema",s={};module.exports.createJsonValidator=function(r){var s,i=new o({reportPathAsArray:!0});if(i.setRemoteReference(a,t),e.each(["byte","double","float","int32","int64","mime-type","uri-template"],function(r){o.registerFormat(r,function(){return!0})}),!e.isUndefined(r)&&(s=i.compileSchema(r),s===!1))throw console.error("JSON Schema file"+(r.length>1?"s are":" is")+" invalid:"),e.each(i.getLastErrors(),function(r){console.error("  "+(e.isArray(r.path)?n.pathToPointer(r.path):r.path)+": "+r.message)}),new Error("Unable to create validator due to invalid JSON Schema");return i},module.exports.formatResults=function(r){return r?r.errors.length+r.warnings.length+e.reduce(r.apiDeclarations,function(r,e){return e&&(r+=e.errors.length+e.warnings.length),r},0)>0?r:void 0:r},module.exports.getErrorCount=function(r){var n=0;return r&&(n=r.errors.length,e.each(r.apiDeclarations,function(r){r&&(n+=r.errors.length)})),n},module.exports.getSpec=function(r){var n=s[r];if(e.isUndefined(n))switch(r){case"1.2":n=require("../lib/specs").v1_2;break;case"2.0":n=require("../lib/specs").v2_0}return n},module.exports.getSwaggerVersion=function(r){return e.isPlainObject(r)?r.swaggerVersion||r.swagger:void 0};var i=module.exports.toJsonPointer=function(r){return"#/"+r.map(function(r){return r.replace(/~/g,"~0").replace(/\//g,"~1")}).join("/")};module.exports.printValidationResults=function(n,o,t,a,s,c){var l=function(r,e){return 1===e?r:r+"s"},u=function d(r,n,o){r&&(console.error(r+":"),console.error()),e.each(n,function(r){console.error(new Array(o+1).join(" ")+i(r.path)+": "+r.message),r.inner&&d(void 0,r.inner,o+2)}),r&&console.error()},g=0,h=0;console.error(),a.errors.length>0&&(g+=a.errors.length,u("API Errors",a.errors,2)),a.warnings.length>0&&(h+=a.warnings.length,u("API Warnings",a.warnings,2)),a.apiDeclarations&&a.apiDeclarations.forEach(function(r,e){if(r){var n=t[e].resourcePath||e;r.errors.length>0&&(g+=r.errors.length,u("  API Declaration ("+n+") Errors",r.errors,4)),r.warnings.length>0&&(h+=r.warnings.length,u("  API Declaration ("+n+") Warnings",r.warnings,4))}}),s&&console.error(g>0?g+" "+l("error",g)+" and "+h+" "+l("warning",h):"Validation succeeded but with "+h+" "+l("warning",h)),g>0&&c&&r.exit(1)},module.exports.swaggerOperationMethods=["DELETE","GET","HEAD","OPTIONS","PATCH","POST","PUT"]}).call(this,require("_process"));
},{"../lib/specs":undefined,"../schemas/json-schema-draft-04.json":41,"_process":5,"json-refs":11,"lodash":15,"z-schema":28}],3:[function(require,module,exports){
"use strict";var _=require("lodash"),helpers=require("./helpers"),dateRegExp=/^([0-9]{4})-([0-9]{2})-([0-9]{2})$/,dateTimeRegExp=/^([0-9]{2}):([0-9]{2}):([0-9]{2})(.[0-9]+)?(z|([+-][0-9]{2}:[0-9]{2}))$/,isValidDate=function(e){var t,i,a;return _.isString(e)||(e=e.toString()),i=dateRegExp.exec(e),null===i?!1:(t=i[3],a=i[2],"01">a||a>"12"||"01">t||t>"31"?!1:!0)},isValidDateTime=function(e){var t,i,a,r,n,o,d;return _.isString(e)||(e=e.toString()),o=e.toLowerCase().split("t"),i=o[0],a=o.length>1?o[1]:void 0,isValidDate(i)?(r=dateTimeRegExp.exec(a),null===r?!1:(t=r[1],n=r[2],d=r[3],t>"23"||n>"59"||d>"59"?!1:!0)):!1},throwErrorWithCode=function(e,t){var i=new Error(t);throw i.code=e,i.failedValidation=!0,i};module.exports.validateAgainstSchema=function(e,t,i){var a=function(e){delete e.params,e.inner&&_.each(e.inner,function(e){a(e)})},r=_.isPlainObject(e)?_.cloneDeep(e):e;_.isUndefined(i)&&(i=helpers.createJsonValidator([r]));var n=i.validate(t,r);if(!n)try{throwErrorWithCode("SCHEMA_VALIDATION_FAILED","Failed schema validation")}catch(o){throw o.results={errors:_.map(i.getLastErrors(),function(e){return a(e),e}),warnings:[]},o}};var validateArrayType=module.exports.validateArrayType=function(e){"array"===e.type&&_.isUndefined(e.items)&&throwErrorWithCode("OBJECT_MISSING_REQUIRED_PROPERTY","Missing required property: items")};module.exports.validateContentType=function(e,t,i){var a="function"==typeof i.end,r=a?i.getHeader("content-type"):i.headers["content-type"],n=_.union(e,t);if(r||(r=a?"text/plain":"application/octet-stream"),r=r.split(";")[0],n.length>0&&(a?!0:-1!==["POST","PUT"].indexOf(i.method))&&-1===n.indexOf(r))throw new Error("Invalid content type ("+r+").  These are valid: "+n.join(", "))};var validateEnum=module.exports.validateEnum=function(e,t){_.isUndefined(t)||_.isUndefined(e)||-1!==t.indexOf(e)||throwErrorWithCode("ENUM_MISMATCH","Not an allowable value ("+t.join(", ")+"): "+e)},validateMaximum=module.exports.validateMaximum=function(e,t,i,a){var r,n,o=a===!0?"MAXIMUM_EXCLUSIVE":"MAXIMUM";_.isUndefined(a)&&(a=!1),"integer"===i?n=parseInt(e,10):"number"===i&&(n=parseFloat(e)),_.isUndefined(t)||(r=parseFloat(t),a&&n>=r?throwErrorWithCode(o,"Greater than or equal to the configured maximum ("+t+"): "+e):n>r&&throwErrorWithCode(o,"Greater than the configured maximum ("+t+"): "+e))},validateMaxItems=module.exports.validateMaxItems=function(e,t){!_.isUndefined(t)&&e.length>t&&throwErrorWithCode("ARRAY_LENGTH_LONG","Array is too long ("+e.length+"), maximum "+t)},validateMaxLength=module.exports.validateMaxLength=function(e,t){!_.isUndefined(t)&&e.length>t&&throwErrorWithCode("MAX_LENGTH","String is too long ("+e.length+" chars), maximum "+t)},validateMaxProperties=module.exports.validateMaxProperties=function(e,t){var i=_.isPlainObject(e)?Object.keys(e).length:0;!_.isUndefined(t)&&i>t&&throwErrorWithCode("MAX_PROPERTIES","Number of properties is too many ("+i+" properties), maximum "+t)},validateMinimum=module.exports.validateMinimum=function(e,t,i,a){var r,n,o=a===!0?"MINIMUM_EXCLUSIVE":"MINIMUM";_.isUndefined(a)&&(a=!1),"integer"===i?n=parseInt(e,10):"number"===i&&(n=parseFloat(e)),_.isUndefined(t)||(r=parseFloat(t),a&&r>=n?throwErrorWithCode(o,"Less than or equal to the configured minimum ("+t+"): "+e):r>n&&throwErrorWithCode(o,"Less than the configured minimum ("+t+"): "+e))},validateMinItems=module.exports.validateMinItems=function(e,t){!_.isUndefined(t)&&e.length<t&&throwErrorWithCode("ARRAY_LENGTH_SHORT","Array is too short ("+e.length+"), minimum "+t)},validateMinLength=module.exports.validateMinLength=function(e,t){!_.isUndefined(t)&&e.length<t&&throwErrorWithCode("MIN_LENGTH","String is too short ("+e.length+" chars), minimum "+t)},validateMinProperties=module.exports.validateMinProperties=function(e,t){var i=_.isPlainObject(e)?Object.keys(e).length:0;!_.isUndefined(t)&&t>i&&throwErrorWithCode("MIN_PROPERTIES","Number of properties is too few ("+i+" properties), minimum "+t)},validateMultipleOf=module.exports.validateMultipleOf=function(e,t){_.isUndefined(t)||e%t===0||throwErrorWithCode("MULTIPLE_OF","Not a multiple of "+t)},validatePattern=module.exports.validatePattern=function(e,t){!_.isUndefined(t)&&_.isNull(e.match(new RegExp(t)))&&throwErrorWithCode("PATTERN","Does not match required pattern: "+t)};module.exports.validateRequiredness=function(e,t){!_.isUndefined(t)&&t===!0&&_.isUndefined(e)&&throwErrorWithCode("REQUIRED","Is required")};var validateTypeAndFormat=module.exports.validateTypeAndFormat=function e(t,i,a,r){var n=!0;if(_.isArray(t))_.each(t,function(t,r){e(t,i,a,!0)||throwErrorWithCode("INVALID_TYPE","Value at index "+r+" is not a valid "+i+": "+t)});else switch(i){case"boolean":n=_.isBoolean(t)||-1!==["false","true"].indexOf(t);break;case"integer":n=!_.isNaN(parseInt(t,10));break;case"number":n=!_.isNaN(parseFloat(t));break;case"string":if(!_.isUndefined(a))switch(a){case"date":n=isValidDate(t);break;case"date-time":n=isValidDateTime(t)}break;case"void":n=_.isUndefined(t)}return r?n:void(n||throwErrorWithCode("INVALID_TYPE","void"!==i?"Not a valid "+(_.isUndefined(a)?"":a+" ")+i+": "+t:"Void does not allow a value"))},validateUniqueItems=module.exports.validateUniqueItems=function(e,t){_.isUndefined(t)||_.uniq(e).length===e.length||throwErrorWithCode("ARRAY_UNIQUE","Does not allow duplicate values: "+e.join(", "))};module.exports.validateSchemaConstraints=function(e,t,i,a){var r=function d(e){var t=e;return t.schema&&(i=i.concat(["schema"]),t=d(t.schema)),t},n=t.type;n||(t.schema?(t=r(t),n=t.type||"object"):n="void");try{if("array"===n&&validateArrayType(t),_.isUndefined(a)&&(a="1.2"===e?t.defaultValue:t["default"],i=i.concat(["1.2"===e?"defaultValue":"default"])),_.isUndefined(a))return;"array"===n?_.isUndefined(t.items)?validateTypeAndFormat(a,n,t.format):validateTypeAndFormat(a,"array"===n?t.items.type:n,"array"===n&&t.items.format?t.items.format:t.format):validateTypeAndFormat(a,n,t.format),validateEnum(a,t["enum"]),validateMaximum(a,t.maximum,n,t.exclusiveMaximum),validateMaxItems(a,t.maxItems),validateMaxLength(a,t.maxLength),validateMaxProperties(a,t.maxProperties),validateMinimum(a,t.minimum,n,t.exclusiveMinimum),validateMinItems(a,t.minItems),validateMinLength(a,t.minLength),validateMinProperties(a,t.minProperties),validateMultipleOf(a,t.multipleOf),validatePattern(a,t.pattern),validateUniqueItems(a,t.uniqueItems)}catch(o){throw o.path=i,o}};
},{"./helpers":2,"lodash":15}],4:[function(require,module,exports){
(function(n){!function(){function t(n){var t=!1;return function(){if(t)throw new Error("Callback was already called.");t=!0,n.apply(e,arguments)}}var e,r,u={};e=this,null!=e&&(r=e.async),u.noConflict=function(){return e.async=r,u};var i=Object.prototype.toString,c=Array.isArray||function(n){return"[object Array]"===i.call(n)},a=function(n,t){if(n.forEach)return n.forEach(t);for(var e=0;e<n.length;e+=1)t(n[e],e,n)},o=function(n,t){if(n.map)return n.map(t);var e=[];return a(n,function(n,r,u){e.push(t(n,r,u))}),e},l=function(n,t,e){return n.reduce?n.reduce(t,e):(a(n,function(n,r,u){e=t(e,n,r,u)}),e)},f=function(n){if(Object.keys)return Object.keys(n);var t=[];for(var e in n)n.hasOwnProperty(e)&&t.push(e);return t};"undefined"!=typeof n&&n.nextTick?(u.nextTick=n.nextTick,u.setImmediate="undefined"!=typeof setImmediate?function(n){setImmediate(n)}:u.nextTick):"function"==typeof setImmediate?(u.nextTick=function(n){setImmediate(n)},u.setImmediate=u.nextTick):(u.nextTick=function(n){setTimeout(n,0)},u.setImmediate=u.nextTick),u.each=function(n,e,r){function u(t){t?(r(t),r=function(){}):(i+=1,i>=n.length&&r())}if(r=r||function(){},!n.length)return r();var i=0;a(n,function(n){e(n,t(u))})},u.forEach=u.each,u.eachSeries=function(n,t,e){if(e=e||function(){},!n.length)return e();var r=0,u=function(){t(n[r],function(t){t?(e(t),e=function(){}):(r+=1,r>=n.length?e():u())})};u()},u.forEachSeries=u.eachSeries,u.eachLimit=function(n,t,e,r){var u=s(t);u.apply(null,[n,e,r])},u.forEachLimit=u.eachLimit;var s=function(n){return function(t,e,r){if(r=r||function(){},!t.length||0>=n)return r();var u=0,i=0,c=0;!function a(){if(u>=t.length)return r();for(;n>c&&i<t.length;)i+=1,c+=1,e(t[i-1],function(n){n?(r(n),r=function(){}):(u+=1,c-=1,u>=t.length?r():a())})}()}},p=function(n){return function(){var t=Array.prototype.slice.call(arguments);return n.apply(null,[u.each].concat(t))}},d=function(n,t){return function(){var e=Array.prototype.slice.call(arguments);return t.apply(null,[s(n)].concat(e))}},y=function(n){return function(){var t=Array.prototype.slice.call(arguments);return n.apply(null,[u.eachSeries].concat(t))}},m=function(n,t,e,r){if(t=o(t,function(n,t){return{index:t,value:n}}),r){var u=[];n(t,function(n,t){e(n.value,function(e,r){u[n.index]=r,t(e)})},function(n){r(n,u)})}else n(t,function(n,t){e(n.value,function(n){t(n)})})};u.map=p(m),u.mapSeries=y(m),u.mapLimit=function(n,t,e,r){return v(t)(n,e,r)};var v=function(n){return d(n,m)};u.reduce=function(n,t,e,r){u.eachSeries(n,function(n,r){e(t,n,function(n,e){t=e,r(n)})},function(n){r(n,t)})},u.inject=u.reduce,u.foldl=u.reduce,u.reduceRight=function(n,t,e,r){var i=o(n,function(n){return n}).reverse();u.reduce(i,t,e,r)},u.foldr=u.reduceRight;var h=function(n,t,e,r){var u=[];t=o(t,function(n,t){return{index:t,value:n}}),n(t,function(n,t){e(n.value,function(e){e&&u.push(n),t()})},function(){r(o(u.sort(function(n,t){return n.index-t.index}),function(n){return n.value}))})};u.filter=p(h),u.filterSeries=y(h),u.select=u.filter,u.selectSeries=u.filterSeries;var g=function(n,t,e,r){var u=[];t=o(t,function(n,t){return{index:t,value:n}}),n(t,function(n,t){e(n.value,function(e){e||u.push(n),t()})},function(){r(o(u.sort(function(n,t){return n.index-t.index}),function(n){return n.value}))})};u.reject=p(g),u.rejectSeries=y(g);var k=function(n,t,e,r){n(t,function(n,t){e(n,function(e){e?(r(n),r=function(){}):t()})},function(){r()})};u.detect=p(k),u.detectSeries=y(k),u.some=function(n,t,e){u.each(n,function(n,r){t(n,function(n){n&&(e(!0),e=function(){}),r()})},function(){e(!1)})},u.any=u.some,u.every=function(n,t,e){u.each(n,function(n,r){t(n,function(n){n||(e(!1),e=function(){}),r()})},function(){e(!0)})},u.all=u.every,u.sortBy=function(n,t,e){u.map(n,function(n,e){t(n,function(t,r){t?e(t):e(null,{value:n,criteria:r})})},function(n,t){if(n)return e(n);var r=function(n,t){var e=n.criteria,r=t.criteria;return r>e?-1:e>r?1:0};e(null,o(t.sort(r),function(n){return n.value}))})},u.auto=function(n,t){t=t||function(){};var e=f(n),r=e.length;if(!r)return t();var i={},o=[],s=function(n){o.unshift(n)},p=function(n){for(var t=0;t<o.length;t+=1)if(o[t]===n)return void o.splice(t,1)},d=function(){r--,a(o.slice(0),function(n){n()})};s(function(){if(!r){var n=t;t=function(){},n(null,i)}}),a(e,function(e){var r=c(n[e])?n[e]:[n[e]],o=function(n){var r=Array.prototype.slice.call(arguments,1);if(r.length<=1&&(r=r[0]),n){var c={};a(f(i),function(n){c[n]=i[n]}),c[e]=r,t(n,c),t=function(){}}else i[e]=r,u.setImmediate(d)},y=r.slice(0,Math.abs(r.length-1))||[],m=function(){return l(y,function(n,t){return n&&i.hasOwnProperty(t)},!0)&&!i.hasOwnProperty(e)};if(m())r[r.length-1](o,i);else{var v=function(){m()&&(p(v),r[r.length-1](o,i))};s(v)}})},u.retry=function(n,t,e){var r=5,i=[];"function"==typeof n&&(e=t,t=n,n=r),n=parseInt(n,10)||r;var c=function(r,c){for(var a=function(n,t){return function(e){n(function(n,r){e(!n||t,{err:n,result:r})},c)}};n;)i.push(a(t,!(n-=1)));u.series(i,function(n,t){t=t[t.length-1],(r||e)(t.err,t.result)})};return e?c():c},u.waterfall=function(n,t){if(t=t||function(){},!c(n)){var e=new Error("First argument to waterfall must be an array of functions");return t(e)}if(!n.length)return t();var r=function(n){return function(e){if(e)t.apply(null,arguments),t=function(){};else{var i=Array.prototype.slice.call(arguments,1),c=n.next();i.push(c?r(c):t),u.setImmediate(function(){n.apply(null,i)})}}};r(u.iterator(n))()};var A=function(n,t,e){if(e=e||function(){},c(t))n.map(t,function(n,t){n&&n(function(n){var e=Array.prototype.slice.call(arguments,1);e.length<=1&&(e=e[0]),t.call(null,n,e)})},e);else{var r={};n.each(f(t),function(n,e){t[n](function(t){var u=Array.prototype.slice.call(arguments,1);u.length<=1&&(u=u[0]),r[n]=u,e(t)})},function(n){e(n,r)})}};u.parallel=function(n,t){A({map:u.map,each:u.each},n,t)},u.parallelLimit=function(n,t,e){A({map:v(t),each:s(t)},n,e)},u.series=function(n,t){if(t=t||function(){},c(n))u.mapSeries(n,function(n,t){n&&n(function(n){var e=Array.prototype.slice.call(arguments,1);e.length<=1&&(e=e[0]),t.call(null,n,e)})},t);else{var e={};u.eachSeries(f(n),function(t,r){n[t](function(n){var u=Array.prototype.slice.call(arguments,1);u.length<=1&&(u=u[0]),e[t]=u,r(n)})},function(n){t(n,e)})}},u.iterator=function(n){var t=function(e){var r=function(){return n.length&&n[e].apply(null,arguments),r.next()};return r.next=function(){return e<n.length-1?t(e+1):null},r};return t(0)},u.apply=function(n){var t=Array.prototype.slice.call(arguments,1);return function(){return n.apply(null,t.concat(Array.prototype.slice.call(arguments)))}};var x=function(n,t,e,r){var u=[];n(t,function(n,t){e(n,function(n,e){u=u.concat(e||[]),t(n)})},function(n){r(n,u)})};u.concat=p(x),u.concatSeries=y(x),u.whilst=function(n,t,e){n()?t(function(r){return r?e(r):void u.whilst(n,t,e)}):e()},u.doWhilst=function(n,t,e){n(function(r){if(r)return e(r);var i=Array.prototype.slice.call(arguments,1);t.apply(null,i)?u.doWhilst(n,t,e):e()})},u.until=function(n,t,e){n()?e():t(function(r){return r?e(r):void u.until(n,t,e)})},u.doUntil=function(n,t,e){n(function(r){if(r)return e(r);var i=Array.prototype.slice.call(arguments,1);t.apply(null,i)?e():u.doUntil(n,t,e)})},u.queue=function(n,e){function r(n,t,e,r){return n.started||(n.started=!0),c(t)||(t=[t]),0==t.length?u.setImmediate(function(){n.drain&&n.drain()}):void a(t,function(t){var i={data:t,callback:"function"==typeof r?r:null};e?n.tasks.unshift(i):n.tasks.push(i),n.saturated&&n.tasks.length===n.concurrency&&n.saturated(),u.setImmediate(n.process)})}void 0===e&&(e=1);var i=0,o={tasks:[],concurrency:e,saturated:null,empty:null,drain:null,started:!1,paused:!1,push:function(n,t){r(o,n,!1,t)},kill:function(){o.drain=null,o.tasks=[]},unshift:function(n,t){r(o,n,!0,t)},process:function(){if(!o.paused&&i<o.concurrency&&o.tasks.length){var e=o.tasks.shift();o.empty&&0===o.tasks.length&&o.empty(),i+=1;var r=function(){i-=1,e.callback&&e.callback.apply(e,arguments),o.drain&&o.tasks.length+i===0&&o.drain(),o.process()},u=t(r);n(e.data,u)}},length:function(){return o.tasks.length},running:function(){return i},idle:function(){return o.tasks.length+i===0},pause:function(){o.paused!==!0&&(o.paused=!0,o.process())},resume:function(){o.paused!==!1&&(o.paused=!1,o.process())}};return o},u.priorityQueue=function(n,t){function e(n,t){return n.priority-t.priority}function r(n,t,e){for(var r=-1,u=n.length-1;u>r;){var i=r+(u-r+1>>>1);e(t,n[i])>=0?r=i:u=i-1}return r}function i(n,t,i,o){return n.started||(n.started=!0),c(t)||(t=[t]),0==t.length?u.setImmediate(function(){n.drain&&n.drain()}):void a(t,function(t){var c={data:t,priority:i,callback:"function"==typeof o?o:null};n.tasks.splice(r(n.tasks,c,e)+1,0,c),n.saturated&&n.tasks.length===n.concurrency&&n.saturated(),u.setImmediate(n.process)})}var o=u.queue(n,t);return o.push=function(n,t,e){i(o,n,t,e)},delete o.unshift,o},u.cargo=function(n,t){var e=!1,r=[],i={tasks:r,payload:t,saturated:null,empty:null,drain:null,drained:!0,push:function(n,e){c(n)||(n=[n]),a(n,function(n){r.push({data:n,callback:"function"==typeof e?e:null}),i.drained=!1,i.saturated&&r.length===t&&i.saturated()}),u.setImmediate(i.process)},process:function l(){if(!e){if(0===r.length)return i.drain&&!i.drained&&i.drain(),void(i.drained=!0);var u="number"==typeof t?r.splice(0,t):r.splice(0,r.length),c=o(u,function(n){return n.data});i.empty&&i.empty(),e=!0,n(c,function(){e=!1;var n=arguments;a(u,function(t){t.callback&&t.callback.apply(null,n)}),l()})}},length:function(){return r.length},running:function(){return e}};return i};var S=function(n){return function(t){var e=Array.prototype.slice.call(arguments,1);t.apply(null,e.concat([function(t){var e=Array.prototype.slice.call(arguments,1);"undefined"!=typeof console&&(t?console.error&&console.error(t):console[n]&&a(e,function(t){console[n](t)}))}]))}};u.log=S("log"),u.dir=S("dir"),u.memoize=function(n,t){var e={},r={};t=t||function(n){return n};var i=function(){var i=Array.prototype.slice.call(arguments),c=i.pop(),a=t.apply(null,i);a in e?u.nextTick(function(){c.apply(null,e[a])}):a in r?r[a].push(c):(r[a]=[c],n.apply(null,i.concat([function(){e[a]=arguments;var n=r[a];delete r[a];for(var t=0,u=n.length;u>t;t++)n[t].apply(null,arguments)}])))};return i.memo=e,i.unmemoized=n,i},u.unmemoize=function(n){return function(){return(n.unmemoized||n).apply(null,arguments)}},u.times=function(n,t,e){for(var r=[],i=0;n>i;i++)r.push(i);return u.map(r,t,e)},u.timesSeries=function(n,t,e){for(var r=[],i=0;n>i;i++)r.push(i);return u.mapSeries(r,t,e)},u.seq=function(){var n=arguments;return function(){var t=this,e=Array.prototype.slice.call(arguments),r=e.pop();u.reduce(n,e,function(n,e,r){e.apply(t,n.concat([function(){var n=arguments[0],t=Array.prototype.slice.call(arguments,1);r(n,t)}]))},function(n,e){r.apply(t,[n].concat(e))})}},u.compose=function(){return u.seq.apply(null,Array.prototype.reverse.call(arguments))};var b=function(n,t){var e=function(){var e=this,r=Array.prototype.slice.call(arguments),u=r.pop();return n(t,function(n,t){n.apply(e,r.concat([t]))},u)};if(arguments.length>2){var r=Array.prototype.slice.call(arguments,2);return e.apply(this,r)}return e};u.applyEach=p(b),u.applyEachSeries=y(b),u.forever=function(n,t){function e(r){if(r){if(t)return t(r);throw r}n(e)}e()},"undefined"!=typeof module&&module.exports?module.exports=u:"undefined"!=typeof define&&define.amd?define([],function(){return u}):e.async=u}()}).call(this,require("_process"));
},{"_process":5}],5:[function(require,module,exports){
function noop(){}var process=module.exports={};process.nextTick=function(){var o="undefined"!=typeof window&&window.setImmediate,e="undefined"!=typeof window&&window.postMessage&&window.addEventListener;if(o)return function(o){return window.setImmediate(o)};if(e){var s=[];return window.addEventListener("message",function(o){var e=o.source;if((e===window||null===e)&&"process-tick"===o.data&&(o.stopPropagation(),s.length>0)){var n=s.shift();n()}},!0),function(o){s.push(o),window.postMessage("process-tick","*")}}return function(o){setTimeout(o,0)}}(),process.title="browser",process.browser=!0,process.env={},process.argv=[],process.on=noop,process.addListener=noop,process.once=noop,process.off=noop,process.removeListener=noop,process.removeAllListeners=noop,process.emit=noop,process.binding=function(){throw new Error("process.binding is not supported")},process.cwd=function(){return"/"},process.chdir=function(){throw new Error("process.chdir is not supported")};
},{}],6:[function(require,module,exports){
(function(e){!function(o){function n(e){throw RangeError(M[e])}function t(e,o){for(var n=e.length;n--;)e[n]=o(e[n]);return e}function r(e,o){return t(e.split(L),o).join(".")}function f(e){for(var o,n,t=[],r=0,f=e.length;f>r;)o=e.charCodeAt(r++),o>=55296&&56319>=o&&f>r?(n=e.charCodeAt(r++),56320==(64512&n)?t.push(((1023&o)<<10)+(1023&n)+65536):(t.push(o),r--)):t.push(o);return t}function i(e){return t(e,function(e){var o="";return e>65535&&(e-=65536,o+=T(e>>>10&1023|55296),e=56320|1023&e),o+=T(e)}).join("")}function u(e){return 10>e-48?e-22:26>e-65?e-65:26>e-97?e-97:x}function c(e,o){return e+22+75*(26>e)-((0!=o)<<5)}function d(e,o,n){var t=0;for(e=n?R(e/A):e>>1,e+=R(e/o);e>P*j>>1;t+=x)e=R(e/P);return R(t+(P+1)*e/(e+m))}function l(e){var o,t,r,f,c,l,s,a,p,h,v=[],w=e.length,g=0,y=F,m=I;for(t=e.lastIndexOf(E),0>t&&(t=0),r=0;t>r;++r)e.charCodeAt(r)>=128&&n("not-basic"),v.push(e.charCodeAt(r));for(f=t>0?t+1:0;w>f;){for(c=g,l=1,s=x;f>=w&&n("invalid-input"),a=u(e.charCodeAt(f++)),(a>=x||a>R((b-g)/l))&&n("overflow"),g+=a*l,p=m>=s?C:s>=m+j?j:s-m,!(p>a);s+=x)h=x-p,l>R(b/h)&&n("overflow"),l*=h;o=v.length+1,m=d(g-c,o,0==c),R(g/o)>b-y&&n("overflow"),y+=R(g/o),g%=o,v.splice(g++,0,y)}return i(v)}function s(e){var o,t,r,i,u,l,s,a,p,h,v,w,g,y,m,A=[];for(e=f(e),w=e.length,o=F,t=0,u=I,l=0;w>l;++l)v=e[l],128>v&&A.push(T(v));for(r=i=A.length,i&&A.push(E);w>r;){for(s=b,l=0;w>l;++l)v=e[l],v>=o&&s>v&&(s=v);for(g=r+1,s-o>R((b-t)/g)&&n("overflow"),t+=(s-o)*g,o=s,l=0;w>l;++l)if(v=e[l],o>v&&++t>b&&n("overflow"),v==o){for(a=t,p=x;h=u>=p?C:p>=u+j?j:p-u,!(h>a);p+=x)m=a-h,y=x-h,A.push(T(c(h+m%y,0))),a=R(m/y);A.push(T(c(a,0))),u=d(t,g,r==i),t=0,++r}++t,++o}return A.join("")}function a(e){return r(e,function(e){return O.test(e)?l(e.slice(4).toLowerCase()):e})}function p(e){return r(e,function(e){return S.test(e)?"xn--"+s(e):e})}var h="object"==typeof exports&&exports,v="object"==typeof module&&module&&module.exports==h&&module,w="object"==typeof e&&e;(w.global===w||w.window===w)&&(o=w);var g,y,b=2147483647,x=36,C=1,j=26,m=38,A=700,I=72,F=128,E="-",O=/^xn--/,S=/[^ -~]/,L=/\x2E|\u3002|\uFF0E|\uFF61/g,M={overflow:"Overflow: input needs wider integers to process","not-basic":"Illegal input >= 0x80 (not a basic code point)","invalid-input":"Invalid input"},P=x-C,R=Math.floor,T=String.fromCharCode;if(g={version:"1.2.4",ucs2:{decode:f,encode:i},decode:l,encode:s,toASCII:p,toUnicode:a},"function"==typeof define&&"object"==typeof define.amd&&define.amd)define("punycode",function(){return g});else if(h&&!h.nodeType)if(v)v.exports=g;else for(y in g)g.hasOwnProperty(y)&&(h[y]=g[y]);else o.punycode=g}(this)}).call(this,"undefined"!=typeof global?global:"undefined"!=typeof self?self:"undefined"!=typeof window?window:{});
},{}],7:[function(require,module,exports){
"use strict";function hasOwnProperty(r,e){return Object.prototype.hasOwnProperty.call(r,e)}module.exports=function(r,e,t,n){e=e||"&",t=t||"=";var o={};if("string"!=typeof r||0===r.length)return o;var a=/\+/g;r=r.split(e);var s=1e3;n&&"number"==typeof n.maxKeys&&(s=n.maxKeys);var p=r.length;s>0&&p>s&&(p=s);for(var y=0;p>y;++y){var u,c,i,l,f=r[y].replace(a,"%20"),v=f.indexOf(t);v>=0?(u=f.substr(0,v),c=f.substr(v+1)):(u=f,c=""),i=decodeURIComponent(u),l=decodeURIComponent(c),hasOwnProperty(o,i)?isArray(o[i])?o[i].push(l):o[i]=[o[i],l]:o[i]=l}return o};var isArray=Array.isArray||function(r){return"[object Array]"===Object.prototype.toString.call(r)};
},{}],8:[function(require,module,exports){
"use strict";function map(r,e){if(r.map)return r.map(e);for(var t=[],n=0;n<r.length;n++)t.push(e(r[n],n));return t}var stringifyPrimitive=function(r){switch(typeof r){case"string":return r;case"boolean":return r?"true":"false";case"number":return isFinite(r)?r:"";default:return""}};module.exports=function(r,e,t,n){return e=e||"&",t=t||"=",null===r&&(r=void 0),"object"==typeof r?map(objectKeys(r),function(n){var i=encodeURIComponent(stringifyPrimitive(n))+t;return isArray(r[n])?map(r[n],function(r){return i+encodeURIComponent(stringifyPrimitive(r))}).join(e):i+encodeURIComponent(stringifyPrimitive(r[n]))}).join(e):n?encodeURIComponent(stringifyPrimitive(n))+t+encodeURIComponent(stringifyPrimitive(r)):""};var isArray=Array.isArray||function(r){return"[object Array]"===Object.prototype.toString.call(r)},objectKeys=Object.keys||function(r){var e=[];for(var t in r)Object.prototype.hasOwnProperty.call(r,t)&&e.push(t);return e};
},{}],9:[function(require,module,exports){
"use strict";exports.decode=exports.parse=require("./decode"),exports.encode=exports.stringify=require("./encode");
},{"./decode":7,"./encode":8}],10:[function(require,module,exports){
function Url(){this.protocol=null,this.slashes=null,this.auth=null,this.host=null,this.port=null,this.hostname=null,this.hash=null,this.search=null,this.query=null,this.pathname=null,this.path=null,this.href=null}function urlParse(t,s,e){if(t&&isObject(t)&&t instanceof Url)return t;var h=new Url;return h.parse(t,s,e),h}function urlFormat(t){return isString(t)&&(t=urlParse(t)),t instanceof Url?t.format():Url.prototype.format.call(t)}function urlResolve(t,s){return urlParse(t,!1,!0).resolve(s)}function urlResolveObject(t,s){return t?urlParse(t,!1,!0).resolveObject(s):s}function isString(t){return"string"==typeof t}function isObject(t){return"object"==typeof t&&null!==t}function isNull(t){return null===t}function isNullOrUndefined(t){return null==t}var punycode=require("punycode");exports.parse=urlParse,exports.resolve=urlResolve,exports.resolveObject=urlResolveObject,exports.format=urlFormat,exports.Url=Url;var protocolPattern=/^([a-z0-9.+-]+:)/i,portPattern=/:[0-9]*$/,delims=["<",">",'"',"`"," ","\r","\n","	"],unwise=["{","}","|","\\","^","`"].concat(delims),autoEscape=["'"].concat(unwise),nonHostChars=["%","/","?",";","#"].concat(autoEscape),hostEndingChars=["/","?","#"],hostnameMaxLen=255,hostnamePartPattern=/^[a-z0-9A-Z_-]{0,63}$/,hostnamePartStart=/^([a-z0-9A-Z_-]{0,63})(.*)$/,unsafeProtocol={javascript:!0,"javascript:":!0},hostlessProtocol={javascript:!0,"javascript:":!0},slashedProtocol={http:!0,https:!0,ftp:!0,gopher:!0,file:!0,"http:":!0,"https:":!0,"ftp:":!0,"gopher:":!0,"file:":!0},querystring=require("querystring");Url.prototype.parse=function(t,s,e){if(!isString(t))throw new TypeError("Parameter 'url' must be a string, not "+typeof t);var h=t;h=h.trim();var r=protocolPattern.exec(h);if(r){r=r[0];var o=r.toLowerCase();this.protocol=o,h=h.substr(r.length)}if(e||r||h.match(/^\/\/[^@\/]+@[^@\/]+/)){var a="//"===h.substr(0,2);!a||r&&hostlessProtocol[r]||(h=h.substr(2),this.slashes=!0)}if(!hostlessProtocol[r]&&(a||r&&!slashedProtocol[r])){for(var n=-1,i=0;i<hostEndingChars.length;i++){var l=h.indexOf(hostEndingChars[i]);-1!==l&&(-1===n||n>l)&&(n=l)}var c,u;u=-1===n?h.lastIndexOf("@"):h.lastIndexOf("@",n),-1!==u&&(c=h.slice(0,u),h=h.slice(u+1),this.auth=decodeURIComponent(c)),n=-1;for(var i=0;i<nonHostChars.length;i++){var l=h.indexOf(nonHostChars[i]);-1!==l&&(-1===n||n>l)&&(n=l)}-1===n&&(n=h.length),this.host=h.slice(0,n),h=h.slice(n),this.parseHost(),this.hostname=this.hostname||"";var p="["===this.hostname[0]&&"]"===this.hostname[this.hostname.length-1];if(!p)for(var f=this.hostname.split(/\./),i=0,m=f.length;m>i;i++){var v=f[i];if(v&&!v.match(hostnamePartPattern)){for(var g="",y=0,d=v.length;d>y;y++)g+=v.charCodeAt(y)>127?"x":v[y];if(!g.match(hostnamePartPattern)){var P=f.slice(0,i),b=f.slice(i+1),j=v.match(hostnamePartStart);j&&(P.push(j[1]),b.unshift(j[2])),b.length&&(h="/"+b.join(".")+h),this.hostname=P.join(".");break}}}if(this.hostname=this.hostname.length>hostnameMaxLen?"":this.hostname.toLowerCase(),!p){for(var O=this.hostname.split("."),q=[],i=0;i<O.length;++i){var x=O[i];q.push(x.match(/[^A-Za-z0-9_-]/)?"xn--"+punycode.encode(x):x)}this.hostname=q.join(".")}var U=this.port?":"+this.port:"",C=this.hostname||"";this.host=C+U,this.href+=this.host,p&&(this.hostname=this.hostname.substr(1,this.hostname.length-2),"/"!==h[0]&&(h="/"+h))}if(!unsafeProtocol[o])for(var i=0,m=autoEscape.length;m>i;i++){var A=autoEscape[i],E=encodeURIComponent(A);E===A&&(E=escape(A)),h=h.split(A).join(E)}var w=h.indexOf("#");-1!==w&&(this.hash=h.substr(w),h=h.slice(0,w));var R=h.indexOf("?");if(-1!==R?(this.search=h.substr(R),this.query=h.substr(R+1),s&&(this.query=querystring.parse(this.query)),h=h.slice(0,R)):s&&(this.search="",this.query={}),h&&(this.pathname=h),slashedProtocol[o]&&this.hostname&&!this.pathname&&(this.pathname="/"),this.pathname||this.search){var U=this.pathname||"",x=this.search||"";this.path=U+x}return this.href=this.format(),this},Url.prototype.format=function(){var t=this.auth||"";t&&(t=encodeURIComponent(t),t=t.replace(/%3A/i,":"),t+="@");var s=this.protocol||"",e=this.pathname||"",h=this.hash||"",r=!1,o="";this.host?r=t+this.host:this.hostname&&(r=t+(-1===this.hostname.indexOf(":")?this.hostname:"["+this.hostname+"]"),this.port&&(r+=":"+this.port)),this.query&&isObject(this.query)&&Object.keys(this.query).length&&(o=querystring.stringify(this.query));var a=this.search||o&&"?"+o||"";return s&&":"!==s.substr(-1)&&(s+=":"),this.slashes||(!s||slashedProtocol[s])&&r!==!1?(r="//"+(r||""),e&&"/"!==e.charAt(0)&&(e="/"+e)):r||(r=""),h&&"#"!==h.charAt(0)&&(h="#"+h),a&&"?"!==a.charAt(0)&&(a="?"+a),e=e.replace(/[?#]/g,function(t){return encodeURIComponent(t)}),a=a.replace("#","%23"),s+r+e+a+h},Url.prototype.resolve=function(t){return this.resolveObject(urlParse(t,!1,!0)).format()},Url.prototype.resolveObject=function(t){if(isString(t)){var s=new Url;s.parse(t,!1,!0),t=s}var e=new Url;if(Object.keys(this).forEach(function(t){e[t]=this[t]},this),e.hash=t.hash,""===t.href)return e.href=e.format(),e;if(t.slashes&&!t.protocol)return Object.keys(t).forEach(function(s){"protocol"!==s&&(e[s]=t[s])}),slashedProtocol[e.protocol]&&e.hostname&&!e.pathname&&(e.path=e.pathname="/"),e.href=e.format(),e;if(t.protocol&&t.protocol!==e.protocol){if(!slashedProtocol[t.protocol])return Object.keys(t).forEach(function(s){e[s]=t[s]}),e.href=e.format(),e;if(e.protocol=t.protocol,t.host||hostlessProtocol[t.protocol])e.pathname=t.pathname;else{for(var h=(t.pathname||"").split("/");h.length&&!(t.host=h.shift()););t.host||(t.host=""),t.hostname||(t.hostname=""),""!==h[0]&&h.unshift(""),h.length<2&&h.unshift(""),e.pathname=h.join("/")}if(e.search=t.search,e.query=t.query,e.host=t.host||"",e.auth=t.auth,e.hostname=t.hostname||t.host,e.port=t.port,e.pathname||e.search){var r=e.pathname||"",o=e.search||"";e.path=r+o}return e.slashes=e.slashes||t.slashes,e.href=e.format(),e}var a=e.pathname&&"/"===e.pathname.charAt(0),n=t.host||t.pathname&&"/"===t.pathname.charAt(0),i=n||a||e.host&&t.pathname,l=i,c=e.pathname&&e.pathname.split("/")||[],h=t.pathname&&t.pathname.split("/")||[],u=e.protocol&&!slashedProtocol[e.protocol];if(u&&(e.hostname="",e.port=null,e.host&&(""===c[0]?c[0]=e.host:c.unshift(e.host)),e.host="",t.protocol&&(t.hostname=null,t.port=null,t.host&&(""===h[0]?h[0]=t.host:h.unshift(t.host)),t.host=null),i=i&&(""===h[0]||""===c[0])),n)e.host=t.host||""===t.host?t.host:e.host,e.hostname=t.hostname||""===t.hostname?t.hostname:e.hostname,e.search=t.search,e.query=t.query,c=h;else if(h.length)c||(c=[]),c.pop(),c=c.concat(h),e.search=t.search,e.query=t.query;else if(!isNullOrUndefined(t.search)){if(u){e.hostname=e.host=c.shift();var p=e.host&&e.host.indexOf("@")>0?e.host.split("@"):!1;p&&(e.auth=p.shift(),e.host=e.hostname=p.shift())}return e.search=t.search,e.query=t.query,isNull(e.pathname)&&isNull(e.search)||(e.path=(e.pathname?e.pathname:"")+(e.search?e.search:"")),e.href=e.format(),e}if(!c.length)return e.pathname=null,e.path=e.search?"/"+e.search:null,e.href=e.format(),e;for(var f=c.slice(-1)[0],m=(e.host||t.host)&&("."===f||".."===f)||""===f,v=0,g=c.length;g>=0;g--)f=c[g],"."==f?c.splice(g,1):".."===f?(c.splice(g,1),v++):v&&(c.splice(g,1),v--);if(!i&&!l)for(;v--;v)c.unshift("..");!i||""===c[0]||c[0]&&"/"===c[0].charAt(0)||c.unshift(""),m&&"/"!==c.join("/").substr(-1)&&c.push("");var y=""===c[0]||c[0]&&"/"===c[0].charAt(0);if(u){e.hostname=e.host=y?"":c.length?c.shift():"";var p=e.host&&e.host.indexOf("@")>0?e.host.split("@"):!1;p&&(e.auth=p.shift(),e.host=e.hostname=p.shift())}return i=i||e.host&&c.length,i&&!y&&c.unshift(""),c.length?e.pathname=c.join("/"):(e.pathname=null,e.path=null),isNull(e.pathname)&&isNull(e.search)||(e.path=(e.pathname?e.pathname:"")+(e.search?e.search:"")),e.auth=t.auth||e.auth,e.slashes=e.slashes||t.slashes,e.href=e.format(),e},Url.prototype.parseHost=function(){var t=this.host,s=portPattern.exec(t);s&&(s=s[0],":"!==s&&(this.port=s.substr(1)),t=t.substr(0,t.length-s.length)),t&&(this.hostname=t)};
},{"punycode":6,"querystring":9}],11:[function(require,module,exports){
"use strict";var _=require("lodash"),request=require("superagent"),traverse=require("traverse"),remoteCache={},getRemoteJson=function(e,r){var t,n=e.split("#")[0],i=remoteCache[n];_.isUndefined(i)?request.get(e).set("user-agent","whitlockjc/json-refs").end(function(e){if(_.isPlainObject(e.body))i=e.body;else try{i=JSON.parse(e.text)}catch(o){t=o}remoteCache[n]=i,r(t,i)}):r(t,i)},isJsonReference=module.exports.isJsonReference=function(e){return _.isPlainObject(e)&&_.isString(e.$ref)},pathToPointer=module.exports.pathToPointer=function(e){if(_.isUndefined(e))throw new Error("path is required");if(!_.isArray(e))throw new Error("path must be an array");var r="#";return e.length>0&&(r+="/"+_.map(e,function(e){return e.replace(/~/g,"~0").replace(/\//g,"~1")}).join("/")),r},findRefs=module.exports.findRefs=function(e){if(_.isUndefined(e))throw new Error("json is required");if(!_.isPlainObject(e))throw new Error("json must be an object");return traverse(e).reduce(function(e){var r=this.node;return"$ref"===this.key&&isJsonReference(this.parent.node)&&(e[pathToPointer(this.path)]=r),e},{})},isRemotePointer=module.exports.isRemotePointer=function(e){if(_.isUndefined(e))throw new Error("ptr is required");if(!_.isString(e))throw new Error("ptr must be a string");return/^https?:\/\//.test(e)},pathFromPointer=module.exports.pathFromPointer=function(e){if(_.isUndefined(e))throw new Error("ptr is required");if(!_.isString(e))throw new Error("ptr must be a string");var r=[];return isRemotePointer(e)?r=e:"#"===e.charAt(0)&&"#"!==e&&(r=_.map(e.substring(1).split("/"),function(e){return e.replace(/~0/g,"~").replace(/~1/g,"/")}),r.length>1&&r.shift()),r},resolveRefs=module.exports.resolveRefs=function e(r,t){if(_.isUndefined(r))throw new Error("json is required");if(!_.isPlainObject(r))throw new Error("json must be an object");if(_.isUndefined(t))throw new Error("done is required");if(!_.isFunction(t))throw new Error("done must be a function");var n,i=!1,o=findRefs(r),s=function(e){return e.map(function(){this.circular&&this.update(traverse(this.node).map(function(){this.circular&&this.parent.remove()}))})};Object.keys(o).length>0?(n=traverse(_.cloneDeep(r)),_.each(o,function(o,a){var u=pathFromPointer(a),f=u.slice(0,u.length-1);isRemotePointer(o)?(i=!0,getRemoteJson(o,function(r,i){r?t(r):e(i,function(e,r){e?t(e):(0===f.length?n.value=r:n.set(f,traverse(r).get(pathFromPointer(-1===o.indexOf("#")?"#":o.substring(o.indexOf("#"))))),t(void 0,s(n)))})})):0===f.length?n.value=r:n.set(f,n.get(pathFromPointer(o)))}),i||t(void 0,s(n))):t(void 0,r)};
},{"lodash":15,"superagent":12,"traverse":18}],12:[function(require,module,exports){
function noop(){}function isHost(t){var e={}.toString.call(t);switch(e){case"[object File]":case"[object Blob]":case"[object FormData]":return!0;default:return!1}}function getXHR(){if(root.XMLHttpRequest&&("file:"!=root.location.protocol||!root.ActiveXObject))return new XMLHttpRequest;try{return new ActiveXObject("Microsoft.XMLHTTP")}catch(t){}try{return new ActiveXObject("Msxml2.XMLHTTP.6.0")}catch(t){}try{return new ActiveXObject("Msxml2.XMLHTTP.3.0")}catch(t){}try{return new ActiveXObject("Msxml2.XMLHTTP")}catch(t){}return!1}function isObject(t){return t===Object(t)}function serialize(t){if(!isObject(t))return t;var e=[];for(var r in t)null!=t[r]&&e.push(encodeURIComponent(r)+"="+encodeURIComponent(t[r]));return e.join("&")}function parseString(t){for(var e,r,s={},i=t.split("&"),o=0,n=i.length;n>o;++o)r=i[o],e=r.split("="),s[decodeURIComponent(e[0])]=decodeURIComponent(e[1]);return s}function parseHeader(t){var e,r,s,i,o=t.split(/\r?\n/),n={};o.pop();for(var u=0,a=o.length;a>u;++u)r=o[u],e=r.indexOf(":"),s=r.slice(0,e).toLowerCase(),i=trim(r.slice(e+1)),n[s]=i;return n}function type(t){return t.split(/ *; */).shift()}function params(t){return reduce(t.split(/ *; */),function(t,e){var r=e.split(/ *= */),s=r.shift(),i=r.shift();return s&&i&&(t[s]=i),t},{})}function Response(t,e){e=e||{},this.req=t,this.xhr=this.req.xhr,this.text=this.xhr.responseText,this.setStatusProperties(this.xhr.status),this.header=this.headers=parseHeader(this.xhr.getAllResponseHeaders()),this.header["content-type"]=this.xhr.getResponseHeader("content-type"),this.setHeaderProperties(this.header),this.body="HEAD"!=this.req.method?this.parseBody(this.text):null}function Request(t,e){var r=this;Emitter.call(this),this._query=this._query||[],this.method=t,this.url=e,this.header={},this._header={},this.on("end",function(){try{var e=new Response(r);"HEAD"==t&&(e.text=null),r.callback(null,e)}catch(s){var i=new Error("Parser is unable to parse the response");i.parse=!0,i.original=s,r.callback(i)}})}function request(t,e){return"function"==typeof e?new Request("GET",t).end(e):1==arguments.length?new Request("GET",t):new Request(t,e)}var Emitter=require("emitter"),reduce=require("reduce"),root="undefined"==typeof window?this:window,trim="".trim?function(t){return t.trim()}:function(t){return t.replace(/(^\s*|\s*$)/g,"")};request.serializeObject=serialize,request.parseString=parseString,request.types={html:"text/html",json:"application/json",xml:"application/xml",urlencoded:"application/x-www-form-urlencoded",form:"application/x-www-form-urlencoded","form-data":"application/x-www-form-urlencoded"},request.serialize={"application/x-www-form-urlencoded":serialize,"application/json":JSON.stringify},request.parse={"application/x-www-form-urlencoded":parseString,"application/json":JSON.parse},Response.prototype.get=function(t){return this.header[t.toLowerCase()]},Response.prototype.setHeaderProperties=function(){var t=this.header["content-type"]||"";this.type=type(t);var e=params(t);for(var r in e)this[r]=e[r]},Response.prototype.parseBody=function(t){var e=request.parse[this.type];return e&&t&&t.length?e(t):null},Response.prototype.setStatusProperties=function(t){var e=t/100|0;this.status=t,this.statusType=e,this.info=1==e,this.ok=2==e,this.clientError=4==e,this.serverError=5==e,this.error=4==e||5==e?this.toError():!1,this.accepted=202==t,this.noContent=204==t||1223==t,this.badRequest=400==t,this.unauthorized=401==t,this.notAcceptable=406==t,this.notFound=404==t,this.forbidden=403==t},Response.prototype.toError=function(){var t=this.req,e=t.method,r=t.url,s="cannot "+e+" "+r+" ("+this.status+")",i=new Error(s);return i.status=this.status,i.method=e,i.url=r,i},request.Response=Response,Emitter(Request.prototype),Request.prototype.use=function(t){return t(this),this},Request.prototype.timeout=function(t){return this._timeout=t,this},Request.prototype.clearTimeout=function(){return this._timeout=0,clearTimeout(this._timer),this},Request.prototype.abort=function(){return this.aborted?void 0:(this.aborted=!0,this.xhr.abort(),this.clearTimeout(),this.emit("abort"),this)},Request.prototype.set=function(t,e){if(isObject(t)){for(var r in t)this.set(r,t[r]);return this}return this._header[t.toLowerCase()]=e,this.header[t]=e,this},Request.prototype.unset=function(t){return delete this._header[t.toLowerCase()],delete this.header[t],this},Request.prototype.getHeader=function(t){return this._header[t.toLowerCase()]},Request.prototype.type=function(t){return this.set("Content-Type",request.types[t]||t),this},Request.prototype.accept=function(t){return this.set("Accept",request.types[t]||t),this},Request.prototype.auth=function(t,e){var r=btoa(t+":"+e);return this.set("Authorization","Basic "+r),this},Request.prototype.query=function(t){return"string"!=typeof t&&(t=serialize(t)),t&&this._query.push(t),this},Request.prototype.field=function(t,e){return this._formData||(this._formData=new FormData),this._formData.append(t,e),this},Request.prototype.attach=function(t,e,r){return this._formData||(this._formData=new FormData),this._formData.append(t,e,r),this},Request.prototype.send=function(t){var e=isObject(t),r=this.getHeader("Content-Type");if(e&&isObject(this._data))for(var s in t)this._data[s]=t[s];else"string"==typeof t?(r||this.type("form"),r=this.getHeader("Content-Type"),this._data="application/x-www-form-urlencoded"==r?this._data?this._data+"&"+t:t:(this._data||"")+t):this._data=t;return e?(r||this.type("json"),this):this},Request.prototype.callback=function(t,e){var r=this._callback;return 2==r.length?r(t,e):t?this.emit("error",t):void r(e)},Request.prototype.crossDomainError=function(){var t=new Error("Origin is not allowed by Access-Control-Allow-Origin");t.crossDomain=!0,this.callback(t)},Request.prototype.timeoutError=function(){var t=this._timeout,e=new Error("timeout of "+t+"ms exceeded");e.timeout=t,this.callback(e)},Request.prototype.withCredentials=function(){return this._withCredentials=!0,this},Request.prototype.end=function(t){var e=this,r=this.xhr=getXHR(),s=this._query.join("&"),i=this._timeout,o=this._formData||this._data;if(this._callback=t||noop,r.onreadystatechange=function(){return 4==r.readyState?0==r.status?e.aborted?e.timeoutError():e.crossDomainError():void e.emit("end"):void 0},r.upload&&(r.upload.onprogress=function(t){t.percent=t.loaded/t.total*100,e.emit("progress",t)}),i&&!this._timer&&(this._timer=setTimeout(function(){e.abort()},i)),s&&(s=request.serializeObject(s),this.url+=~this.url.indexOf("?")?"&"+s:"?"+s),r.open(this.method,this.url,!0),this._withCredentials&&(r.withCredentials=!0),"GET"!=this.method&&"HEAD"!=this.method&&"string"!=typeof o&&!isHost(o)){var n=request.serialize[this.getHeader("Content-Type")];n&&(o=n(o))}for(var u in this.header)null!=this.header[u]&&r.setRequestHeader(u,this.header[u]);return this.emit("request",this),r.send(o),this},request.Request=Request,request.get=function(t,e,r){var s=request("GET",t);return"function"==typeof e&&(r=e,e=null),e&&s.query(e),r&&s.end(r),s},request.head=function(t,e,r){var s=request("HEAD",t);return"function"==typeof e&&(r=e,e=null),e&&s.send(e),r&&s.end(r),s},request.del=function(t,e){var r=request("DELETE",t);return e&&r.end(e),r},request.patch=function(t,e,r){var s=request("PATCH",t);return"function"==typeof e&&(r=e,e=null),e&&s.send(e),r&&s.end(r),s},request.post=function(t,e,r){var s=request("POST",t);return"function"==typeof e&&(r=e,e=null),e&&s.send(e),r&&s.end(r),s},request.put=function(t,e,r){var s=request("PUT",t);return"function"==typeof e&&(r=e,e=null),e&&s.send(e),r&&s.end(r),s},module.exports=request;
},{"emitter":13,"reduce":14}],13:[function(require,module,exports){
function Emitter(t){return t?mixin(t):void 0}function mixin(t){for(var e in Emitter.prototype)t[e]=Emitter.prototype[e];return t}module.exports=Emitter,Emitter.prototype.on=Emitter.prototype.addEventListener=function(t,e){return this._callbacks=this._callbacks||{},(this._callbacks[t]=this._callbacks[t]||[]).push(e),this},Emitter.prototype.once=function(t,e){function i(){r.off(t,i),e.apply(this,arguments)}var r=this;return this._callbacks=this._callbacks||{},i.fn=e,this.on(t,i),this},Emitter.prototype.off=Emitter.prototype.removeListener=Emitter.prototype.removeAllListeners=Emitter.prototype.removeEventListener=function(t,e){if(this._callbacks=this._callbacks||{},0==arguments.length)return this._callbacks={},this;var i=this._callbacks[t];if(!i)return this;if(1==arguments.length)return delete this._callbacks[t],this;for(var r,s=0;s<i.length;s++)if(r=i[s],r===e||r.fn===e){i.splice(s,1);break}return this},Emitter.prototype.emit=function(t){this._callbacks=this._callbacks||{};var e=[].slice.call(arguments,1),i=this._callbacks[t];if(i){i=i.slice(0);for(var r=0,s=i.length;s>r;++r)i[r].apply(this,e)}return this},Emitter.prototype.listeners=function(t){return this._callbacks=this._callbacks||{},this._callbacks[t]||[]},Emitter.prototype.hasListeners=function(t){return!!this.listeners(t).length};
},{}],14:[function(require,module,exports){
module.exports=function(l,n,e){for(var r=0,t=l.length,u=3==arguments.length?e:l[r++];t>r;)u=n.call(null,u,l[r],++r,l);return u};
},{}],15:[function(require,module,exports){
(function(n){(function(){function t(n,t,r){for(var e=(r||0)-1,u=n?n.length:0;++e<u;)if(n[e]===t)return e;return-1}function r(n,r){var e=typeof r;if(n=n.cache,"boolean"==e||null==r)return n[r]?0:-1;"number"!=e&&"string"!=e&&(e="object");var u="number"==e?r:d+r;return n=(n=n[e])&&n[u],"object"==e?n&&t(n,r)>-1?0:-1:n?0:-1}function e(n){var t=this.cache,r=typeof n;if("boolean"==r||null==n)t[n]=!0;else{"number"!=r&&"string"!=r&&(r="object");var e="number"==r?n:d+n,u=t[r]||(t[r]={});"object"==r?(u[e]||(u[e]=[])).push(n):u[e]=!0}}function u(n){return n.charCodeAt(0)}function o(n,t){for(var r=n.criteria,e=t.criteria,u=-1,o=r.length;++u<o;){var a=r[u],i=e[u];if(a!==i){if(a>i||"undefined"==typeof a)return 1;if(i>a||"undefined"==typeof i)return-1}}return n.index-t.index}function a(n){var t=-1,r=n.length,u=n[0],o=n[r/2|0],a=n[r-1];if(u&&"object"==typeof u&&o&&"object"==typeof o&&a&&"object"==typeof a)return!1;var i=l();i["false"]=i["null"]=i["true"]=i.undefined=!1;var f=l();for(f.array=n,f.cache=i,f.push=e;++t<r;)f.push(n[t]);return f}function i(n){return"\\"+H[n]}function f(){return g.pop()||[]}function l(){return y.pop()||{array:null,cache:null,criteria:null,"false":!1,index:0,"null":!1,number:null,object:null,push:null,string:null,"true":!1,undefined:!1,value:null}}function c(n){n.length=0,g.length<_&&g.push(n)}function p(n){var t=n.cache;t&&p(t),n.array=n.cache=n.criteria=n.object=n.number=n.string=n.value=null,y.length<_&&y.push(n)}function s(n,t,r){t||(t=0),"undefined"==typeof r&&(r=n?n.length:0);for(var e=-1,u=r-t||0,o=Array(0>u?0:u);++e<u;)o[e]=n[t+e];return o}function v(n){function e(n){return n&&"object"==typeof n&&!Xe(n)&&De.call(n,"__wrapped__")?n:new g(n)}function g(n,t){this.__chain__=!!t,this.__wrapped__=n}function y(n){function t(){if(e){var n=s(e);Te.apply(n,arguments)}if(this instanceof t){var o=H(r.prototype),a=r.apply(o,n||arguments);return It(a)?a:o}return r.apply(u,n||arguments)}var r=n[0],e=n[2],u=n[4];return Qe(t,n),t}function _(n,t,r,e,u){if(r){var o=r(n);if("undefined"!=typeof o)return o}var a=It(n);if(!a)return n;var i=Oe.call(n);if(!U[i])return n;var l=He[i];switch(i){case B:case W:return new l(+n);case z:case K:return new l(n);case P:return o=l(n.source,O.exec(n)),o.lastIndex=n.lastIndex,o}var p=Xe(n);if(t){var v=!e;e||(e=f()),u||(u=f());for(var h=e.length;h--;)if(e[h]==n)return u[h];o=p?l(n.length):{}}else o=p?s(n):uu({},n);return p&&(De.call(n,"index")&&(o.index=n.index),De.call(n,"input")&&(o.input=n.input)),t?(e.push(n),u.push(o),(p?Qt:iu)(n,function(n,a){o[a]=_(n,t,r,e,u)}),v&&(c(e),c(u)),o):o}function H(n){return It(n)?qe(n):{}}function Q(n,t,r){if("function"!=typeof n)return Xr;if("undefined"==typeof t||!("prototype"in n))return n;var e=n.__bindData__;if("undefined"==typeof e&&(Je.funcNames&&(e=!n.name),e=e||!Je.funcDecomp,!e)){var u=Se.call(n);Je.funcNames||(e=!N.test(u)),e||(e=S.test(u),Qe(n,e))}if(e===!1||e!==!0&&1&e[1])return n;switch(r){case 1:return function(r){return n.call(t,r)};case 2:return function(r,e){return n.call(t,r,e)};case 3:return function(r,e,u){return n.call(t,r,e,u)};case 4:return function(r,e,u,o){return n.call(t,r,e,u,o)}}return Tr(n,t)}function X(n){function t(){var n=f?a:this;if(u){var h=s(u);Te.apply(h,arguments)}if((o||c)&&(h||(h=s(arguments)),o&&Te.apply(h,o),c&&h.length<i))return e|=16,X([r,p?e:-4&e,h,null,a,i]);if(h||(h=arguments),l&&(r=n[v]),this instanceof t){n=H(r.prototype);var g=r.apply(n,h);return It(g)?g:n}return r.apply(n,h)}var r=n[0],e=n[1],u=n[2],o=n[3],a=n[4],i=n[5],f=1&e,l=2&e,c=4&e,p=8&e,v=r;return Qe(t,n),t}function Y(n,e){var u=-1,o=ft(),i=n?n.length:0,f=i>=b&&o===t,l=[];if(f){var c=a(e);c?(o=r,e=c):f=!1}for(;++u<i;){var s=n[u];o(e,s)<0&&l.push(s)}return f&&p(e),l}function Z(n,t,r,e){for(var u=(e||0)-1,o=n?n.length:0,a=[];++u<o;){var i=n[u];if(i&&"object"==typeof i&&"number"==typeof i.length&&(Xe(i)||st(i))){t||(i=Z(i,t,r));var f=-1,l=i.length,c=a.length;for(a.length+=l;++f<l;)a[c++]=i[f]}else r||a.push(i)}return a}function tt(n,t,r,e,u,o){if(r){var a=r(n,t);if("undefined"!=typeof a)return!!a}if(n===t)return 0!==n||1/n==1/t;var i=typeof n,l=typeof t;if(!(n!==n||n&&G[i]||t&&G[l]))return!1;if(null==n||null==t)return n===t;var p=Oe.call(n),s=Oe.call(t);if(p==$&&(p=L),s==$&&(s=L),p!=s)return!1;switch(p){case B:case W:return+n==+t;case z:return n!=+n?t!=+t:0==n?1/n==1/t:n==+t;case P:case K:return n==we(t)}var v=p==F;if(!v){var h=De.call(n,"__wrapped__"),g=De.call(t,"__wrapped__");if(h||g)return tt(h?n.__wrapped__:n,g?t.__wrapped__:t,r,e,u,o);if(p!=L)return!1;var y=n.constructor,m=t.constructor;if(y!=m&&!(Et(y)&&y instanceof y&&Et(m)&&m instanceof m)&&"constructor"in n&&"constructor"in t)return!1}var d=!u;u||(u=f()),o||(o=f());for(var b=u.length;b--;)if(u[b]==n)return o[b]==t;var _=0;if(a=!0,u.push(n),o.push(t),v){if(b=n.length,_=t.length,a=_==b,a||e)for(;_--;){var w=b,j=t[_];if(e)for(;w--&&!(a=tt(n[w],j,r,e,u,o)););else if(!(a=tt(n[_],j,r,e,u,o)))break}}else au(t,function(t,i,f){return De.call(f,i)?(_++,a=De.call(n,i)&&tt(n[i],t,r,e,u,o)):void 0}),a&&!e&&au(n,function(n,t,r){return De.call(r,t)?a=--_>-1:void 0});return u.pop(),o.pop(),d&&(c(u),c(o)),a}function rt(n,t,r,e,u){(Xe(t)?Qt:iu)(t,function(t,o){var a,i,f=t,l=n[o];if(t&&((i=Xe(t))||fu(t))){for(var c=e.length;c--;)if(a=e[c]==t){l=u[c];break}if(!a){var p;r&&(f=r(l,t),(p="undefined"!=typeof f)&&(l=f)),p||(l=i?Xe(l)?l:[]:fu(l)?l:{}),e.push(t),u.push(l),p||rt(l,t,r,e,u)}}else r&&(f=r(l,t),"undefined"==typeof f&&(f=t)),"undefined"!=typeof f&&(l=f);n[o]=l})}function et(n,t){return n+Ie(Ge()*(t-n+1))}function ut(n,e,u){var o=-1,i=ft(),l=n?n.length:0,s=[],v=!e&&l>=b&&i===t,h=u||v?f():s;if(v){var g=a(h);i=r,h=g}for(;++o<l;){var y=n[o],m=u?u(y,o,n):y;(e?!o||h[h.length-1]!==m:i(h,m)<0)&&((u||v)&&h.push(m),s.push(y))}return v?(c(h.array),p(h)):u&&c(h),s}function ot(n){return function(t,r,u){var o={};r=e.createCallback(r,u,3);var a=-1,i=t?t.length:0;if("number"==typeof i)for(;++a<i;){var f=t[a];n(o,f,r(f,a,t),t)}else iu(t,function(t,e,u){n(o,t,r(t,e,u),u)});return o}}function at(n,t,r,e,u,o){var a=1&t,i=2&t,f=4&t,l=16&t,c=32&t;if(!i&&!Et(n))throw new je;l&&!r.length&&(t&=-17,l=r=!1),c&&!e.length&&(t&=-33,c=e=!1);var p=n&&n.__bindData__;if(p&&p!==!0)return p=s(p),p[2]&&(p[2]=s(p[2])),p[3]&&(p[3]=s(p[3])),!a||1&p[1]||(p[4]=u),!a&&1&p[1]&&(t|=8),!f||4&p[1]||(p[5]=o),l&&Te.apply(p[2]||(p[2]=[]),r),c&&Be.apply(p[3]||(p[3]=[]),e),p[1]|=t,at.apply(null,p);var v=1==t||17===t?y:X;return v([n,t,r,e,u,o])}function it(n){return nu[n]}function ft(){var n=(n=e.indexOf)===mr?t:n;return n}function lt(n){return"function"==typeof n&&Ne.test(n)}function ct(n){var t,r;return n&&Oe.call(n)==L&&(t=n.constructor,!Et(t)||t instanceof t)?(au(n,function(n,t){r=t}),"undefined"==typeof r||De.call(n,r)):!1}function pt(n){return tu[n]}function st(n){return n&&"object"==typeof n&&"number"==typeof n.length&&Oe.call(n)==$||!1}function vt(n,t,r,e){return"boolean"!=typeof t&&null!=t&&(e=r,r=t,t=!1),_(n,t,"function"==typeof r&&Q(r,e,1))}function ht(n,t,r){return _(n,!0,"function"==typeof t&&Q(t,r,1))}function gt(n,t){var r=H(n);return t?uu(r,t):r}function yt(n,t,r){var u;return t=e.createCallback(t,r,3),iu(n,function(n,r,e){return t(n,r,e)?(u=r,!1):void 0}),u}function mt(n,t,r){var u;return t=e.createCallback(t,r,3),bt(n,function(n,r,e){return t(n,r,e)?(u=r,!1):void 0}),u}function dt(n,t,r){var e=[];au(n,function(n,t){e.push(t,n)});var u=e.length;for(t=Q(t,r,3);u--&&t(e[u--],e[u],n)!==!1;);return n}function bt(n,t,r){var e=Ze(n),u=e.length;for(t=Q(t,r,3);u--;){var o=e[u];if(t(n[o],o,n)===!1)break}return n}function _t(n){var t=[];return au(n,function(n,r){Et(n)&&t.push(r)}),t.sort()}function wt(n,t){return n?De.call(n,t):!1}function jt(n){for(var t=-1,r=Ze(n),e=r.length,u={};++t<e;){var o=r[t];u[n[o]]=o}return u}function kt(n){return n===!0||n===!1||n&&"object"==typeof n&&Oe.call(n)==B||!1}function xt(n){return n&&"object"==typeof n&&Oe.call(n)==W||!1}function Ct(n){return n&&1===n.nodeType||!1}function Ot(n){var t=!0;if(!n)return t;var r=Oe.call(n),e=n.length;return r==F||r==K||r==$||r==L&&"number"==typeof e&&Et(n.splice)?!e:(iu(n,function(){return t=!1}),t)}function Nt(n,t,r,e){return tt(n,t,"function"==typeof r&&Q(r,e,2))}function Rt(n){return Le(n)&&!Pe(parseFloat(n))}function Et(n){return"function"==typeof n}function It(n){return!(!n||!G[typeof n])}function St(n){return Dt(n)&&n!=+n}function At(n){return null===n}function Dt(n){return"number"==typeof n||n&&"object"==typeof n&&Oe.call(n)==z||!1}function Tt(n){return n&&"object"==typeof n&&Oe.call(n)==P||!1}function $t(n){return"string"==typeof n||n&&"object"==typeof n&&Oe.call(n)==K||!1}function Ft(n){return"undefined"==typeof n}function Bt(n,t,r){var u={};return t=e.createCallback(t,r,3),iu(n,function(n,r,e){u[r]=t(n,r,e)}),u}function Wt(n){var t=arguments,r=2;if(!It(n))return n;if("number"!=typeof t[2]&&(r=t.length),r>3&&"function"==typeof t[r-2])var e=Q(t[--r-1],t[r--],2);else r>2&&"function"==typeof t[r-1]&&(e=t[--r]);for(var u=s(arguments,1,r),o=-1,a=f(),i=f();++o<r;)rt(n,u[o],e,a,i);return c(a),c(i),n}function qt(n,t,r){var u={};if("function"!=typeof t){var o=[];au(n,function(n,t){o.push(t)}),o=Y(o,Z(arguments,!0,!1,1));for(var a=-1,i=o.length;++a<i;){var f=o[a];u[f]=n[f]}}else t=e.createCallback(t,r,3),au(n,function(n,r,e){t(n,r,e)||(u[r]=n)});return u}function zt(n){for(var t=-1,r=Ze(n),e=r.length,u=ve(e);++t<e;){var o=r[t];u[t]=[o,n[o]]}return u}function Lt(n,t,r){var u={};if("function"!=typeof t)for(var o=-1,a=Z(arguments,!0,!1,1),i=It(n)?a.length:0;++o<i;){var f=a[o];f in n&&(u[f]=n[f])}else t=e.createCallback(t,r,3),au(n,function(n,r,e){t(n,r,e)&&(u[r]=n)});return u}function Pt(n,t,r,u){var o=Xe(n);if(null==r)if(o)r=[];else{var a=n&&n.constructor,i=a&&a.prototype;r=H(i)}return t&&(t=e.createCallback(t,u,4),(o?Qt:iu)(n,function(n,e,u){return t(r,n,e,u)})),r}function Kt(n){for(var t=-1,r=Ze(n),e=r.length,u=ve(e);++t<e;)u[t]=n[r[t]];return u}function Ut(n){for(var t=arguments,r=-1,e=Z(t,!0,!1,1),u=t[2]&&t[2][t[1]]===n?1:e.length,o=ve(u);++r<u;)o[r]=n[e[r]];return o}function Mt(n,t,r){var e=-1,u=ft(),o=n?n.length:0,a=!1;return r=(0>r?Ue(0,o+r):r)||0,Xe(n)?a=u(n,t,r)>-1:"number"==typeof o?a=($t(n)?n.indexOf(t,r):u(n,t,r))>-1:iu(n,function(n){return++e>=r?!(a=n===t):void 0}),a}function Vt(n,t,r){var u=!0;t=e.createCallback(t,r,3);var o=-1,a=n?n.length:0;if("number"==typeof a)for(;++o<a&&(u=!!t(n[o],o,n)););else iu(n,function(n,r,e){return u=!!t(n,r,e)});return u}function Gt(n,t,r){var u=[];t=e.createCallback(t,r,3);var o=-1,a=n?n.length:0;if("number"==typeof a)for(;++o<a;){var i=n[o];t(i,o,n)&&u.push(i)}else iu(n,function(n,r,e){t(n,r,e)&&u.push(n)});return u}function Ht(n,t,r){t=e.createCallback(t,r,3);var u=-1,o=n?n.length:0;if("number"!=typeof o){var a;return iu(n,function(n,r,e){return t(n,r,e)?(a=n,!1):void 0}),a}for(;++u<o;){var i=n[u];if(t(i,u,n))return i}}function Jt(n,t,r){var u;return t=e.createCallback(t,r,3),Xt(n,function(n,r,e){return t(n,r,e)?(u=n,!1):void 0}),u}function Qt(n,t,r){var e=-1,u=n?n.length:0;if(t=t&&"undefined"==typeof r?t:Q(t,r,3),"number"==typeof u)for(;++e<u&&t(n[e],e,n)!==!1;);else iu(n,t);return n}function Xt(n,t,r){var e=n?n.length:0;if(t=t&&"undefined"==typeof r?t:Q(t,r,3),"number"==typeof e)for(;e--&&t(n[e],e,n)!==!1;);else{var u=Ze(n);e=u.length,iu(n,function(n,r,o){return r=u?u[--e]:--e,t(o[r],r,o)})}return n}function Yt(n,t){var r=s(arguments,2),e=-1,u="function"==typeof t,o=n?n.length:0,a=ve("number"==typeof o?o:0);return Qt(n,function(n){a[++e]=(u?t:n[t]).apply(n,r)}),a}function Zt(n,t,r){var u=-1,o=n?n.length:0;if(t=e.createCallback(t,r,3),"number"==typeof o)for(var a=ve(o);++u<o;)a[u]=t(n[u],u,n);else a=[],iu(n,function(n,r,e){a[++u]=t(n,r,e)});return a}function nr(n,t,r){var o=-1/0,a=o;if("function"!=typeof t&&r&&r[t]===n&&(t=null),null==t&&Xe(n))for(var i=-1,f=n.length;++i<f;){var l=n[i];l>a&&(a=l)}else t=null==t&&$t(n)?u:e.createCallback(t,r,3),Qt(n,function(n,r,e){var u=t(n,r,e);u>o&&(o=u,a=n)});return a}function tr(n,t,r){var o=1/0,a=o;if("function"!=typeof t&&r&&r[t]===n&&(t=null),null==t&&Xe(n))for(var i=-1,f=n.length;++i<f;){var l=n[i];a>l&&(a=l)}else t=null==t&&$t(n)?u:e.createCallback(t,r,3),Qt(n,function(n,r,e){var u=t(n,r,e);o>u&&(o=u,a=n)});return a}function rr(n,t,r,u){if(!n)return r;var o=arguments.length<3;t=e.createCallback(t,u,4);var a=-1,i=n.length;if("number"==typeof i)for(o&&(r=n[++a]);++a<i;)r=t(r,n[a],a,n);else iu(n,function(n,e,u){r=o?(o=!1,n):t(r,n,e,u)});return r}function er(n,t,r,u){var o=arguments.length<3;return t=e.createCallback(t,u,4),Xt(n,function(n,e,u){r=o?(o=!1,n):t(r,n,e,u)}),r}function ur(n,t,r){return t=e.createCallback(t,r,3),Gt(n,function(n,r,e){return!t(n,r,e)})}function or(n,t,r){if(n&&"number"!=typeof n.length&&(n=Kt(n)),null==t||r)return n?n[et(0,n.length-1)]:h;var e=ar(n);return e.length=Me(Ue(0,t),e.length),e}function ar(n){var t=-1,r=n?n.length:0,e=ve("number"==typeof r?r:0);return Qt(n,function(n){var r=et(0,++t);e[t]=e[r],e[r]=n}),e}function ir(n){var t=n?n.length:0;return"number"==typeof t?t:Ze(n).length}function fr(n,t,r){var u;t=e.createCallback(t,r,3);var o=-1,a=n?n.length:0;if("number"==typeof a)for(;++o<a&&!(u=t(n[o],o,n)););else iu(n,function(n,r,e){return!(u=t(n,r,e))});return!!u}function lr(n,t,r){var u=-1,a=Xe(t),i=n?n.length:0,s=ve("number"==typeof i?i:0);for(a||(t=e.createCallback(t,r,3)),Qt(n,function(n,r,e){var o=s[++u]=l();a?o.criteria=Zt(t,function(t){return n[t]}):(o.criteria=f())[0]=t(n,r,e),o.index=u,o.value=n}),i=s.length,s.sort(o);i--;){var v=s[i];s[i]=v.value,a||c(v.criteria),p(v)}return s}function cr(n){return n&&"number"==typeof n.length?s(n):Kt(n)}function pr(n){for(var t=-1,r=n?n.length:0,e=[];++t<r;){var u=n[t];u&&e.push(u)}return e}function sr(n){return Y(n,Z(arguments,!0,!0,1))}function vr(n,t,r){var u=-1,o=n?n.length:0;for(t=e.createCallback(t,r,3);++u<o;)if(t(n[u],u,n))return u;return-1}function hr(n,t,r){var u=n?n.length:0;for(t=e.createCallback(t,r,3);u--;)if(t(n[u],u,n))return u;return-1}function gr(n,t,r){var u=0,o=n?n.length:0;if("number"!=typeof t&&null!=t){var a=-1;for(t=e.createCallback(t,r,3);++a<o&&t(n[a],a,n);)u++}else if(u=t,null==u||r)return n?n[0]:h;return s(n,0,Me(Ue(0,u),o))}function yr(n,t,r,e){return"boolean"!=typeof t&&null!=t&&(e=r,r="function"!=typeof t&&e&&e[t]===n?null:t,t=!1),null!=r&&(n=Zt(n,r,e)),Z(n,t)}function mr(n,r,e){if("number"==typeof e){var u=n?n.length:0;e=0>e?Ue(0,u+e):e||0}else if(e){var o=Or(n,r);return n[o]===r?o:-1}return t(n,r,e)}function dr(n,t,r){var u=0,o=n?n.length:0;if("number"!=typeof t&&null!=t){var a=o;for(t=e.createCallback(t,r,3);a--&&t(n[a],a,n);)u++}else u=null==t||r?1:t||u;return s(n,0,Me(Ue(0,o-u),o))}function br(){for(var n=[],e=-1,u=arguments.length,o=f(),i=ft(),l=i===t,s=f();++e<u;){var v=arguments[e];(Xe(v)||st(v))&&(n.push(v),o.push(l&&v.length>=b&&a(e?n[e]:s)))}var h=n[0],g=-1,y=h?h.length:0,m=[];n:for(;++g<y;){var d=o[0];if(v=h[g],(d?r(d,v):i(s,v))<0){for(e=u,(d||s).push(v);--e;)if(d=o[e],(d?r(d,v):i(n[e],v))<0)continue n;m.push(v)}}for(;u--;)d=o[u],d&&p(d);return c(o),c(s),m}function _r(n,t,r){var u=0,o=n?n.length:0;if("number"!=typeof t&&null!=t){var a=o;for(t=e.createCallback(t,r,3);a--&&t(n[a],a,n);)u++}else if(u=t,null==u||r)return n?n[o-1]:h;return s(n,Ue(0,o-u))}function wr(n,t,r){var e=n?n.length:0;for("number"==typeof r&&(e=(0>r?Ue(0,e+r):Me(r,e-1))+1);e--;)if(n[e]===t)return e;return-1}function jr(n){for(var t=arguments,r=0,e=t.length,u=n?n.length:0;++r<e;)for(var o=-1,a=t[r];++o<u;)n[o]===a&&(Fe.call(n,o--,1),u--);return n}function kr(n,t,r){n=+n||0,r="number"==typeof r?r:+r||1,null==t&&(t=n,n=0);for(var e=-1,u=Ue(0,Re((t-n)/(r||1))),o=ve(u);++e<u;)o[e]=n,n+=r;return o}function xr(n,t,r){var u=-1,o=n?n.length:0,a=[];for(t=e.createCallback(t,r,3);++u<o;){var i=n[u];t(i,u,n)&&(a.push(i),Fe.call(n,u--,1),o--)}return a}function Cr(n,t,r){if("number"!=typeof t&&null!=t){var u=0,o=-1,a=n?n.length:0;for(t=e.createCallback(t,r,3);++o<a&&t(n[o],o,n);)u++}else u=null==t||r?1:Ue(0,t);return s(n,u)}function Or(n,t,r,u){var o=0,a=n?n.length:o;for(r=r?e.createCallback(r,u,1):Xr,t=r(t);a>o;){var i=o+a>>>1;r(n[i])<t?o=i+1:a=i}return o}function Nr(){return ut(Z(arguments,!0,!0))}function Rr(n,t,r,u){return"boolean"!=typeof t&&null!=t&&(u=r,r="function"!=typeof t&&u&&u[t]===n?null:t,t=!1),null!=r&&(r=e.createCallback(r,u,3)),ut(n,t,r)}function Er(n){return Y(n,s(arguments,1))}function Ir(){for(var n=-1,t=arguments.length;++n<t;){var r=arguments[n];if(Xe(r)||st(r))var e=e?ut(Y(e,r).concat(Y(r,e))):r}return e||[]}function Sr(){for(var n=arguments.length>1?arguments:arguments[0],t=-1,r=n?nr(su(n,"length")):0,e=ve(0>r?0:r);++t<r;)e[t]=su(n,t);return e}function Ar(n,t){var r=-1,e=n?n.length:0,u={};for(t||!e||Xe(n[0])||(t=[]);++r<e;){var o=n[r];t?u[o]=t[r]:o&&(u[o[0]]=o[1])}return u}function Dr(n,t){if(!Et(t))throw new je;return function(){return--n<1?t.apply(this,arguments):void 0}}function Tr(n,t){return arguments.length>2?at(n,17,s(arguments,2),null,t):at(n,1,null,null,t)}function $r(n){for(var t=arguments.length>1?Z(arguments,!0,!1,1):_t(n),r=-1,e=t.length;++r<e;){var u=t[r];n[u]=at(n[u],1,null,null,n)}return n}function Fr(n,t){return arguments.length>2?at(t,19,s(arguments,2),null,n):at(t,3,null,null,n)}function Br(){for(var n=arguments,t=n.length;t--;)if(!Et(n[t]))throw new je;return function(){for(var t=arguments,r=n.length;r--;)t=[n[r].apply(this,t)];return t[0]}}function Wr(n,t){return t="number"==typeof t?t:+t||n.length,at(n,4,null,null,null,t)}function qr(n,t,r){var e,u,o,a,i,f,l,c=0,p=!1,s=!0;if(!Et(n))throw new je;if(t=Ue(0,t)||0,r===!0){var v=!0;s=!1}else It(r)&&(v=r.leading,p="maxWait"in r&&(Ue(t,r.maxWait)||0),s="trailing"in r?r.trailing:s);var g=function(){var r=t-(hu()-a);if(0>=r){u&&Ee(u);var p=l;u=f=l=h,p&&(c=hu(),o=n.apply(i,e),f||u||(e=i=null))}else f=$e(g,r)},y=function(){f&&Ee(f),u=f=l=h,(s||p!==t)&&(c=hu(),o=n.apply(i,e),f||u||(e=i=null))};return function(){if(e=arguments,a=hu(),i=this,l=s&&(f||!v),p===!1)var r=v&&!f;else{u||v||(c=a);var h=p-(a-c),m=0>=h;m?(u&&(u=Ee(u)),c=a,o=n.apply(i,e)):u||(u=$e(y,h))}return m&&f?f=Ee(f):f||t===p||(f=$e(g,t)),r&&(m=!0,o=n.apply(i,e)),!m||f||u||(e=i=null),o}}function zr(n){if(!Et(n))throw new je;var t=s(arguments,1);return $e(function(){n.apply(h,t)},1)}function Lr(n,t){if(!Et(n))throw new je;var r=s(arguments,2);return $e(function(){n.apply(h,r)},t)}function Pr(n,t){if(!Et(n))throw new je;var r=function(){var e=r.cache,u=t?t.apply(this,arguments):d+arguments[0];return De.call(e,u)?e[u]:e[u]=n.apply(this,arguments)};return r.cache={},r}function Kr(n){var t,r;if(!Et(n))throw new je;return function(){return t?r:(t=!0,r=n.apply(this,arguments),n=null,r)}}function Ur(n){return at(n,16,s(arguments,1))}function Mr(n){return at(n,32,null,s(arguments,1))}function Vr(n,t,r){var e=!0,u=!0;if(!Et(n))throw new je;return r===!1?e=!1:It(r)&&(e="leading"in r?r.leading:e,u="trailing"in r?r.trailing:u),M.leading=e,M.maxWait=t,M.trailing=u,qr(n,t,M)}function Gr(n,t){return at(t,16,[n])}function Hr(n){return function(){return n}}function Jr(n,t,r){var e=typeof n;if(null==n||"function"==e)return Q(n,t,r);if("object"!=e)return te(n);var u=Ze(n),o=u[0],a=n[o];return 1!=u.length||a!==a||It(a)?function(t){for(var r=u.length,e=!1;r--&&(e=tt(t[u[r]],n[u[r]],null,!0)););return e}:function(n){var t=n[o];return a===t&&(0!==a||1/a==1/t)}}function Qr(n){return null==n?"":we(n).replace(eu,it)}function Xr(n){return n}function Yr(n,t,r){var u=!0,o=t&&_t(t);t&&(r||o.length)||(null==r&&(r=t),a=g,t=n,n=e,o=_t(t)),r===!1?u=!1:It(r)&&"chain"in r&&(u=r.chain);var a=n,i=Et(a);Qt(o,function(r){var e=n[r]=t[r];i&&(a.prototype[r]=function(){var t=this.__chain__,r=this.__wrapped__,o=[r];Te.apply(o,arguments);var i=e.apply(n,o);if(u||t){if(r===i&&It(i))return this;i=new a(i),i.__chain__=t}return i})})}function Zr(){return n._=Ce,this}function ne(){}function te(n){return function(t){return t[n]}}function re(n,t,r){var e=null==n,u=null==t;if(null==r&&("boolean"==typeof n&&u?(r=n,n=1):u||"boolean"!=typeof t||(r=t,u=!0)),e&&u&&(t=1),n=+n||0,u?(t=n,n=0):t=+t||0,r||n%1||t%1){var o=Ge();return Me(n+o*(t-n+parseFloat("1e-"+((o+"").length-1))),t)}return et(n,t)}function ee(n,t){if(n){var r=n[t];return Et(r)?n[t]():r}}function ue(n,t,r){var u=e.templateSettings;n=we(n||""),r=ou({},r,u);var o,a=ou({},r.imports,u.imports),f=Ze(a),l=Kt(a),c=0,p=r.interpolate||I,s="__p += '",v=_e((r.escape||I).source+"|"+p.source+"|"+(p===R?C:I).source+"|"+(r.evaluate||I).source+"|$","g");n.replace(v,function(t,r,e,u,a,f){return e||(e=u),s+=n.slice(c,f).replace(A,i),r&&(s+="' +\n__e("+r+") +\n'"),a&&(o=!0,s+="';\n"+a+";\n__p += '"),e&&(s+="' +\n((__t = ("+e+")) == null ? '' : __t) +\n'"),c=f+t.length,t}),s+="';\n";var g=r.variable,y=g;y||(g="obj",s="with ("+g+") {\n"+s+"\n}\n"),s=(o?s.replace(j,""):s).replace(k,"$1").replace(x,"$1;"),s="function("+g+") {\n"+(y?"":g+" || ("+g+" = {});\n")+"var __t, __p = '', __e = _.escape"+(o?", __j = Array.prototype.join;\nfunction print() { __p += __j.call(arguments, '') }\n":";\n")+s+"return __p\n}";var m="\n/*\n//# sourceURL="+(r.sourceURL||"/lodash/template/source["+T++ +"]")+"\n*/";try{var d=ye(f,"return "+s+m).apply(h,l)}catch(b){throw b.source=s,b}return t?d(t):(d.source=s,d)}function oe(n,t,r){n=(n=+n)>-1?n:0;var e=-1,u=ve(n);for(t=Q(t,r,1);++e<n;)u[e]=t(e);return u}function ae(n){return null==n?"":we(n).replace(ru,pt)}function ie(n){var t=++m;return we(null==n?"":n)+t}function fe(n){return n=new g(n),n.__chain__=!0,n}function le(n,t){return t(n),n}function ce(){return this.__chain__=!0,this}function pe(){return we(this.__wrapped__)}function se(){return this.__wrapped__}n=n?nt.defaults(J.Object(),n,nt.pick(J,D)):J;var ve=n.Array,he=n.Boolean,ge=n.Date,ye=n.Function,me=n.Math,de=n.Number,be=n.Object,_e=n.RegExp,we=n.String,je=n.TypeError,ke=[],xe=be.prototype,Ce=n._,Oe=xe.toString,Ne=_e("^"+we(Oe).replace(/[.*+?^${}()|[\]\\]/g,"\\$&").replace(/toString| for [^\]]+/g,".*?")+"$"),Re=me.ceil,Ee=n.clearTimeout,Ie=me.floor,Se=ye.prototype.toString,Ae=lt(Ae=be.getPrototypeOf)&&Ae,De=xe.hasOwnProperty,Te=ke.push,$e=n.setTimeout,Fe=ke.splice,Be=ke.unshift,We=function(){try{var n={},t=lt(t=be.defineProperty)&&t,r=t(n,n,n)&&t}catch(e){}return r}(),qe=lt(qe=be.create)&&qe,ze=lt(ze=ve.isArray)&&ze,Le=n.isFinite,Pe=n.isNaN,Ke=lt(Ke=be.keys)&&Ke,Ue=me.max,Me=me.min,Ve=n.parseInt,Ge=me.random,He={};He[F]=ve,He[B]=he,He[W]=ge,He[q]=ye,He[L]=be,He[z]=de,He[P]=_e,He[K]=we,g.prototype=e.prototype;var Je=e.support={};Je.funcDecomp=!lt(n.WinRTError)&&S.test(v),Je.funcNames="string"==typeof ye.name,e.templateSettings={escape:/<%-([\s\S]+?)%>/g,evaluate:/<%([\s\S]+?)%>/g,interpolate:R,variable:"",imports:{_:e}},qe||(H=function(){function t(){}return function(r){if(It(r)){t.prototype=r;var e=new t;t.prototype=null}return e||n.Object()}}());var Qe=We?function(n,t){V.value=t,We(n,"__bindData__",V)}:ne,Xe=ze||function(n){return n&&"object"==typeof n&&"number"==typeof n.length&&Oe.call(n)==F||!1},Ye=function(n){var t,r=n,e=[];if(!r)return e;if(!G[typeof n])return e;for(t in r)De.call(r,t)&&e.push(t);return e},Ze=Ke?function(n){return It(n)?Ke(n):[]}:Ye,nu={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"},tu=jt(nu),ru=_e("("+Ze(tu).join("|")+")","g"),eu=_e("["+Ze(nu).join("")+"]","g"),uu=function(n,t,r){var e,u=n,o=u;if(!u)return o;var a=arguments,i=0,f="number"==typeof r?2:a.length;if(f>3&&"function"==typeof a[f-2])var l=Q(a[--f-1],a[f--],2);else f>2&&"function"==typeof a[f-1]&&(l=a[--f]);for(;++i<f;)if(u=a[i],u&&G[typeof u])for(var c=-1,p=G[typeof u]&&Ze(u),s=p?p.length:0;++c<s;)e=p[c],o[e]=l?l(o[e],u[e]):u[e];return o},ou=function(n,t,r){var e,u=n,o=u;if(!u)return o;for(var a=arguments,i=0,f="number"==typeof r?2:a.length;++i<f;)if(u=a[i],u&&G[typeof u])for(var l=-1,c=G[typeof u]&&Ze(u),p=c?c.length:0;++l<p;)e=c[l],"undefined"==typeof o[e]&&(o[e]=u[e]);return o},au=function(n,t,r){var e,u=n,o=u;if(!u)return o;if(!G[typeof u])return o;t=t&&"undefined"==typeof r?t:Q(t,r,3);for(e in u)if(t(u[e],e,n)===!1)return o;return o},iu=function(n,t,r){var e,u=n,o=u;if(!u)return o;if(!G[typeof u])return o;t=t&&"undefined"==typeof r?t:Q(t,r,3);for(var a=-1,i=G[typeof u]&&Ze(u),f=i?i.length:0;++a<f;)if(e=i[a],t(u[e],e,n)===!1)return o;return o},fu=Ae?function(n){if(!n||Oe.call(n)!=L)return!1;var t=n.valueOf,r=lt(t)&&(r=Ae(t))&&Ae(r);return r?n==r||Ae(n)==r:ct(n)}:ct,lu=ot(function(n,t,r){De.call(n,r)?n[r]++:n[r]=1}),cu=ot(function(n,t,r){(De.call(n,r)?n[r]:n[r]=[]).push(t)}),pu=ot(function(n,t,r){n[r]=t}),su=Zt,vu=Gt,hu=lt(hu=ge.now)&&hu||function(){return(new ge).getTime()},gu=8==Ve(w+"08")?Ve:function(n,t){return Ve($t(n)?n.replace(E,""):n,t||0)};return e.after=Dr,e.assign=uu,e.at=Ut,e.bind=Tr,e.bindAll=$r,e.bindKey=Fr,e.chain=fe,e.compact=pr,e.compose=Br,e.constant=Hr,e.countBy=lu,e.create=gt,e.createCallback=Jr,e.curry=Wr,e.debounce=qr,e.defaults=ou,e.defer=zr,e.delay=Lr,e.difference=sr,e.filter=Gt,e.flatten=yr,e.forEach=Qt,e.forEachRight=Xt,e.forIn=au,e.forInRight=dt,e.forOwn=iu,e.forOwnRight=bt,e.functions=_t,e.groupBy=cu,e.indexBy=pu,e.initial=dr,e.intersection=br,e.invert=jt,e.invoke=Yt,e.keys=Ze,e.map=Zt,e.mapValues=Bt,e.max=nr,e.memoize=Pr,e.merge=Wt,e.min=tr,e.omit=qt,e.once=Kr,e.pairs=zt,e.partial=Ur,e.partialRight=Mr,e.pick=Lt,e.pluck=su,e.property=te,e.pull=jr,e.range=kr,e.reject=ur,e.remove=xr,e.rest=Cr,e.shuffle=ar,e.sortBy=lr,e.tap=le,e.throttle=Vr,e.times=oe,e.toArray=cr,e.transform=Pt,e.union=Nr,e.uniq=Rr,e.values=Kt,e.where=vu,e.without=Er,e.wrap=Gr,e.xor=Ir,e.zip=Sr,e.zipObject=Ar,e.collect=Zt,e.drop=Cr,e.each=Qt,e.eachRight=Xt,e.extend=uu,e.methods=_t,e.object=Ar,e.select=Gt,e.tail=Cr,e.unique=Rr,e.unzip=Sr,Yr(e),e.clone=vt,e.cloneDeep=ht,e.contains=Mt,e.escape=Qr,e.every=Vt,e.find=Ht,e.findIndex=vr,e.findKey=yt,e.findLast=Jt,e.findLastIndex=hr,e.findLastKey=mt,e.has=wt,e.identity=Xr,e.indexOf=mr,e.isArguments=st,e.isArray=Xe,e.isBoolean=kt,e.isDate=xt,e.isElement=Ct,e.isEmpty=Ot,e.isEqual=Nt,e.isFinite=Rt,e.isFunction=Et,e.isNaN=St,e.isNull=At,e.isNumber=Dt,e.isObject=It,e.isPlainObject=fu,e.isRegExp=Tt,e.isString=$t,e.isUndefined=Ft,e.lastIndexOf=wr,e.mixin=Yr,e.noConflict=Zr,e.noop=ne,e.now=hu,e.parseInt=gu,e.random=re,e.reduce=rr,e.reduceRight=er,e.result=ee,e.runInContext=v,e.size=ir,e.some=fr,e.sortedIndex=Or,e.template=ue,e.unescape=ae,e.uniqueId=ie,e.all=Vt,e.any=fr,e.detect=Ht,e.findWhere=Ht,e.foldl=rr,e.foldr=er,e.include=Mt,e.inject=rr,Yr(function(){var n={};return iu(e,function(t,r){e.prototype[r]||(n[r]=t)}),n}(),!1),e.first=gr,e.last=_r,e.sample=or,e.take=gr,e.head=gr,iu(e,function(n,t){var r="sample"!==t;e.prototype[t]||(e.prototype[t]=function(t,e){var u=this.__chain__,o=n(this.__wrapped__,t,e);return u||null!=t&&(!e||r&&"function"==typeof t)?new g(o,u):o})}),e.VERSION="2.4.1",e.prototype.chain=ce,e.prototype.toString=pe,e.prototype.value=se,e.prototype.valueOf=se,Qt(["join","pop","shift"],function(n){var t=ke[n];e.prototype[n]=function(){var n=this.__chain__,r=t.apply(this.__wrapped__,arguments);return n?new g(r,n):r}}),Qt(["push","reverse","sort","unshift"],function(n){var t=ke[n];e.prototype[n]=function(){return t.apply(this.__wrapped__,arguments),this}}),Qt(["concat","slice","splice"],function(n){var t=ke[n];e.prototype[n]=function(){return new g(t.apply(this.__wrapped__,arguments),this.__chain__)}}),e}var h,g=[],y=[],m=0,d=+new Date+"",b=75,_=40,w=" 	\f ﻿\n\r\u2028\u2029 ᠎             　",j=/\b__p \+= '';/g,k=/\b(__p \+=) '' \+/g,x=/(__e\(.*?\)|\b__t\)) \+\n'';/g,C=/\$\{([^\\}]*(?:\\.[^\\}]*)*)\}/g,O=/\w*$/,N=/^\s*function[ \n\r\t]+\w/,R=/<%=([\s\S]+?)%>/g,E=RegExp("^["+w+"]*0+(?=.$)"),I=/($^)/,S=/\bthis\b/,A=/['\n\r\t\u2028\u2029\\]/g,D=["Array","Boolean","Date","Function","Math","Number","Object","RegExp","String","_","attachEvent","clearTimeout","isFinite","isNaN","parseInt","setTimeout"],T=0,$="[object Arguments]",F="[object Array]",B="[object Boolean]",W="[object Date]",q="[object Function]",z="[object Number]",L="[object Object]",P="[object RegExp]",K="[object String]",U={};U[q]=!1,U[$]=U[F]=U[B]=U[W]=U[z]=U[L]=U[P]=U[K]=!0;var M={leading:!1,maxWait:0,trailing:!1},V={configurable:!1,enumerable:!1,value:null,writable:!1},G={"boolean":!1,"function":!0,object:!0,number:!1,string:!1,undefined:!1},H={"\\":"\\","'":"'","\n":"n","\r":"r","	":"t","\u2028":"u2028","\u2029":"u2029"},J=G[typeof window]&&window||this,Q=G[typeof exports]&&exports&&!exports.nodeType&&exports,X=G[typeof module]&&module&&!module.nodeType&&module,Y=X&&X.exports===Q&&Q,Z=G[typeof n]&&n;!Z||Z.global!==Z&&Z.window!==Z||(J=Z);var nt=v();"function"==typeof define&&"object"==typeof define.amd&&define.amd?(J._=nt,define(function(){return nt})):Q&&X?Y?(X.exports=nt)._=nt:Q._=nt:J._=nt}).call(this)}).call(this,"undefined"!=typeof global?global:"undefined"!=typeof self?self:"undefined"!=typeof window?window:{});
},{}],16:[function(require,module,exports){
!function(t){if("object"==typeof exports)module.exports=t();else if("function"==typeof define&&define.amd)define(t);else{var r;try{r=window}catch(e){r=self}r.SparkMD5=t()}}(function(){"use strict";var t=function(t,r){return t+r&4294967295},r=function(r,e,n,i,f,o){return e=t(t(e,r),t(i,o)),t(e<<f|e>>>32-f,n)},e=function(t,e,n,i,f,o,s){return r(e&n|~e&i,t,e,f,o,s)},n=function(t,e,n,i,f,o,s){return r(e&i|n&~i,t,e,f,o,s)},i=function(t,e,n,i,f,o,s){return r(e^n^i,t,e,f,o,s)},f=function(t,e,n,i,f,o,s){return r(n^(e|~i),t,e,f,o,s)},o=function(r,o){var s=r[0],u=r[1],a=r[2],h=r[3];s=e(s,u,a,h,o[0],7,-680876936),h=e(h,s,u,a,o[1],12,-389564586),a=e(a,h,s,u,o[2],17,606105819),u=e(u,a,h,s,o[3],22,-1044525330),s=e(s,u,a,h,o[4],7,-176418897),h=e(h,s,u,a,o[5],12,1200080426),a=e(a,h,s,u,o[6],17,-1473231341),u=e(u,a,h,s,o[7],22,-45705983),s=e(s,u,a,h,o[8],7,1770035416),h=e(h,s,u,a,o[9],12,-1958414417),a=e(a,h,s,u,o[10],17,-42063),u=e(u,a,h,s,o[11],22,-1990404162),s=e(s,u,a,h,o[12],7,1804603682),h=e(h,s,u,a,o[13],12,-40341101),a=e(a,h,s,u,o[14],17,-1502002290),u=e(u,a,h,s,o[15],22,1236535329),s=n(s,u,a,h,o[1],5,-165796510),h=n(h,s,u,a,o[6],9,-1069501632),a=n(a,h,s,u,o[11],14,643717713),u=n(u,a,h,s,o[0],20,-373897302),s=n(s,u,a,h,o[5],5,-701558691),h=n(h,s,u,a,o[10],9,38016083),a=n(a,h,s,u,o[15],14,-660478335),u=n(u,a,h,s,o[4],20,-405537848),s=n(s,u,a,h,o[9],5,568446438),h=n(h,s,u,a,o[14],9,-1019803690),a=n(a,h,s,u,o[3],14,-187363961),u=n(u,a,h,s,o[8],20,1163531501),s=n(s,u,a,h,o[13],5,-1444681467),h=n(h,s,u,a,o[2],9,-51403784),a=n(a,h,s,u,o[7],14,1735328473),u=n(u,a,h,s,o[12],20,-1926607734),s=i(s,u,a,h,o[5],4,-378558),h=i(h,s,u,a,o[8],11,-2022574463),a=i(a,h,s,u,o[11],16,1839030562),u=i(u,a,h,s,o[14],23,-35309556),s=i(s,u,a,h,o[1],4,-1530992060),h=i(h,s,u,a,o[4],11,1272893353),a=i(a,h,s,u,o[7],16,-155497632),u=i(u,a,h,s,o[10],23,-1094730640),s=i(s,u,a,h,o[13],4,681279174),h=i(h,s,u,a,o[0],11,-358537222),a=i(a,h,s,u,o[3],16,-722521979),u=i(u,a,h,s,o[6],23,76029189),s=i(s,u,a,h,o[9],4,-640364487),h=i(h,s,u,a,o[12],11,-421815835),a=i(a,h,s,u,o[15],16,530742520),u=i(u,a,h,s,o[2],23,-995338651),s=f(s,u,a,h,o[0],6,-198630844),h=f(h,s,u,a,o[7],10,1126891415),a=f(a,h,s,u,o[14],15,-1416354905),u=f(u,a,h,s,o[5],21,-57434055),s=f(s,u,a,h,o[12],6,1700485571),h=f(h,s,u,a,o[3],10,-1894986606),a=f(a,h,s,u,o[10],15,-1051523),u=f(u,a,h,s,o[1],21,-2054922799),s=f(s,u,a,h,o[8],6,1873313359),h=f(h,s,u,a,o[15],10,-30611744),a=f(a,h,s,u,o[6],15,-1560198380),u=f(u,a,h,s,o[13],21,1309151649),s=f(s,u,a,h,o[4],6,-145523070),h=f(h,s,u,a,o[11],10,-1120210379),a=f(a,h,s,u,o[2],15,718787259),u=f(u,a,h,s,o[9],21,-343485551),r[0]=t(s,r[0]),r[1]=t(u,r[1]),r[2]=t(a,r[2]),r[3]=t(h,r[3])},s=function(t){var r,e=[];for(r=0;64>r;r+=4)e[r>>2]=t.charCodeAt(r)+(t.charCodeAt(r+1)<<8)+(t.charCodeAt(r+2)<<16)+(t.charCodeAt(r+3)<<24);return e},u=function(t){var r,e=[];for(r=0;64>r;r+=4)e[r>>2]=t[r]+(t[r+1]<<8)+(t[r+2]<<16)+(t[r+3]<<24);return e},a=function(t){var r,e,n,i,f,u,a=t.length,h=[1732584193,-271733879,-1732584194,271733878];for(r=64;a>=r;r+=64)o(h,s(t.substring(r-64,r)));for(t=t.substring(r-64),e=t.length,n=[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],r=0;e>r;r+=1)n[r>>2]|=t.charCodeAt(r)<<(r%4<<3);if(n[r>>2]|=128<<(r%4<<3),r>55)for(o(h,n),r=0;16>r;r+=1)n[r]=0;return i=8*a,i=i.toString(16).match(/(.*?)(.{0,8})$/),f=parseInt(i[2],16),u=parseInt(i[1],16)||0,n[14]=f,n[15]=u,o(h,n),h},h=function(t){var r,e,n,i,f,s,a=t.length,h=[1732584193,-271733879,-1732584194,271733878];for(r=64;a>=r;r+=64)o(h,u(t.subarray(r-64,r)));for(t=a>r-64?t.subarray(r-64):new Uint8Array(0),e=t.length,n=[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],r=0;e>r;r+=1)n[r>>2]|=t[r]<<(r%4<<3);if(n[r>>2]|=128<<(r%4<<3),r>55)for(o(h,n),r=0;16>r;r+=1)n[r]=0;return i=8*a,i=i.toString(16).match(/(.*?)(.{0,8})$/),f=parseInt(i[2],16),s=parseInt(i[1],16)||0,n[14]=f,n[15]=s,o(h,n),h},c=["0","1","2","3","4","5","6","7","8","9","a","b","c","d","e","f"],p=function(t){var r,e="";for(r=0;4>r;r+=1)e+=c[t>>8*r+4&15]+c[t>>8*r&15];return e},y=function(t){var r;for(r=0;r<t.length;r+=1)t[r]=p(t[r]);return t.join("")},_=function(t){return y(a(t))},d=function(){this.reset()};return"5d41402abc4b2a76b9719d911017c592"!==_("hello")&&(t=function(t,r){var e=(65535&t)+(65535&r),n=(t>>16)+(r>>16)+(e>>16);return n<<16|65535&e}),d.prototype.append=function(t){return/[\u0080-\uFFFF]/.test(t)&&(t=unescape(encodeURIComponent(t))),this.appendBinary(t),this},d.prototype.appendBinary=function(t){this._buff+=t,this._length+=t.length;var r,e=this._buff.length;for(r=64;e>=r;r+=64)o(this._state,s(this._buff.substring(r-64,r)));return this._buff=this._buff.substr(r-64),this},d.prototype.end=function(t){var r,e,n=this._buff,i=n.length,f=[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];for(r=0;i>r;r+=1)f[r>>2]|=n.charCodeAt(r)<<(r%4<<3);return this._finish(f,i),e=t?this._state:y(this._state),this.reset(),e},d.prototype._finish=function(t,r){var e,n,i,f=r;if(t[f>>2]|=128<<(f%4<<3),f>55)for(o(this._state,t),f=0;16>f;f+=1)t[f]=0;e=8*this._length,e=e.toString(16).match(/(.*?)(.{0,8})$/),n=parseInt(e[2],16),i=parseInt(e[1],16)||0,t[14]=n,t[15]=i,o(this._state,t)},d.prototype.reset=function(){return this._buff="",this._length=0,this._state=[1732584193,-271733879,-1732584194,271733878],this},d.prototype.destroy=function(){delete this._state,delete this._buff,delete this._length},d.hash=function(t,r){/[\u0080-\uFFFF]/.test(t)&&(t=unescape(encodeURIComponent(t)));var e=a(t);return r?e:y(e)},d.hashBinary=function(t,r){var e=a(t);return r?e:y(e)},d.ArrayBuffer=function(){this.reset()},d.ArrayBuffer.prototype.append=function(t){var r,e=this._concatArrayBuffer(this._buff,t),n=e.length;for(this._length+=t.byteLength,r=64;n>=r;r+=64)o(this._state,u(e.subarray(r-64,r)));return this._buff=n>r-64?e.subarray(r-64):new Uint8Array(0),this},d.ArrayBuffer.prototype.end=function(t){var r,e,n=this._buff,i=n.length,f=[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];for(r=0;i>r;r+=1)f[r>>2]|=n[r]<<(r%4<<3);return this._finish(f,i),e=t?this._state:y(this._state),this.reset(),e},d.ArrayBuffer.prototype._finish=d.prototype._finish,d.ArrayBuffer.prototype.reset=function(){return this._buff=new Uint8Array(0),this._length=0,this._state=[1732584193,-271733879,-1732584194,271733878],this},d.ArrayBuffer.prototype.destroy=d.prototype.destroy,d.ArrayBuffer.prototype._concatArrayBuffer=function(t,r){var e=t.length,n=new Uint8Array(e+r.byteLength);return n.set(t),n.set(new Uint8Array(r),e),n},d.ArrayBuffer.hash=function(t,r){var e=h(new Uint8Array(t));return r?e:y(e)},d});
},{}],17:[function(require,module,exports){
function convert(e,t){if("object"!=typeof e)throw new Error("resourceListing must be an object");Array.isArray(t)||(t=[]);var r={},n={},i={swagger:"2.0",info:buildInfo(e),paths:{}};return e.authorizations&&(i.securityDefinitions=buildSecurityDefinitions(e,r)),e.basePath&&assignPathComponents(e.basePath,i),extend(n,e.models),Array.isArray(e.apis)&&e.apis.forEach(function(t){Array.isArray(t.operations)&&(i.paths[t.path]=buildPath(t,e))}),t.forEach(function(e){e.basePath&&assignPathComponents(e.basePath,i),Array.isArray(e.apis)&&(e.apis.forEach(function(t){i.paths[t.path]=buildPath(t,e)}),Object.keys(e.models).length&&extend(n,transformAllModels(e.models)))}),Object.keys(n).length&&(i.definitions=transformAllModels(n)),i}function buildInfo(e){var t={version:e.apiVersion,title:"Title was not specified"};return"object"==typeof e.info&&(e.info.title&&(t.title=e.info.title),e.info.description&&(t.description=e.info.description),e.info.contact&&(t.contact={email:e.info.contact}),e.info.license&&(t.license={name:e.info.license,url:e.info.licenseUrl}),e.info.termsOfServiceUrl&&(t.termsOfService=e.info.termsOfServiceUrl)),t}function assignPathComponents(e,t){var r=urlParse(e);t.host=r.host,t.basePath=r.path,t.schemes=[r.protocol.substr(0,r.protocol.length-1)]}function processDataType(e){return e.$ref&&-1===e.$ref.indexOf("#/definitions/")?e.$ref="#/definitions/"+e.$ref:e.items&&e.items.$ref&&-1===e.items.$ref.indexOf("#/definitions/")&&(e.items.$ref="#/definitions/"+e.items.$ref),e.minimum&&(e.minimum=parseInt(e.minimum)),e.maximum&&(e.maximum=parseInt(e.maximum)),e.defaultValue&&(e["default"]="integer"===e.type?parseInt(e.defaultValue,10):"number"===e.type?parseFloat(e.defaultValue):e.defaultValue,delete e.defaultValue),e}function buildPath(e,t){var r={};return e.operations.forEach(function(e){var n=e.method.toLowerCase();r[n]=buildOperation(e,t.produces,t.consumes)}),r}function buildOperation(e,t,r){var n={responses:{},description:e.description||""};return e.summary&&(n.summary=e.summary),e.nickname&&(n.operationId=e.nickname),t&&(n.produces=t),r&&(n.consumes=r),Array.isArray(e.parameters)&&e.parameters.length&&(n.parameters=e.parameters.map(function(e){return buildParameter(processDataType(e))})),Array.isArray(e.responseMessages)&&e.responseMessages.forEach(function(e){n.responses[e.code]=buildResponse(e)}),Object.keys(n.responses).length||(n.responses={200:{description:"No response was specified"}}),n}function buildResponse(e){var t={};return t.description=e.message,t}function buildParameter(e){var t={"in":e.paramType,description:e.description,name:e.name,required:!!e.required},r=["string","number","boolean","integer","array","void","File"];return-1===r.indexOf(e.type)?t.schema={$ref:"#/definitions/"+e.type}:t.type=e.type.toLowerCase(),"form"===t["in"]&&(t["in"]="formData"),["default","maximum","minimum","items"].forEach(function(r){e[r]&&(t[r]=e[r])}),t}function buildSecurityDefinitions(e,t){var r={};return Object.keys(e.authorizations).forEach(function(n){var i=e.authorizations[n],o=function(e){var t=r[e||n]={type:i.type};return i.passAs&&(t["in"]=i.passAs),i.keyname&&(t.name=i.keyname),t};i.grantTypes?(t[n]=[],Object.keys(i.grantTypes).forEach(function(e){var r=i.grantTypes[e],s=n+"_"+e,a=o(s);switch(t[n].push(s),a.flow="implicit"===e?"implicit":"accessCode",e){case"implicit":a.authorizationUrl=r.loginEndpoint.url;break;case"authorization_code":a.authorizationUrl=r.tokenRequestEndpoint.url,a.tokenUrl=r.tokenEndpoint.url}i.scopes&&(a.scopes={},i.scopes.forEach(function(e){a.scopes[e.scope]=e.description||"Undescribed "+e.scope}))})):o()}),r}function transformModel(e){"object"==typeof e.properties&&Object.keys(e.properties).forEach(function(t){e.properties[t]=processDataType(e.properties[t])})}function transformAllModels(e){if("object"!=typeof e)throw new Error("models must be object");var t={};return Object.keys(e).forEach(function(r){var n=e[r];transformModel(n),n.subTypes&&(t[r]=n.subTypes,delete n.subTypes)}),Object.keys(t).forEach(function(r){t[r].forEach(function(t){var n=e[t];n&&(n.allOf=(n.allOf||[]).concat({$ref:"#/definitions/"+r}))})}),e}function extend(e,t){if("object"!=typeof e)throw new Error("source must be objects");"object"==typeof t&&Object.keys(t).forEach(function(r){e[r]=t[r]})}var urlParse=require("url").parse;"undefined"==typeof window?module.exports=convert:window.SwaggerConverter=window.SwaggerConverter||{convert:convert};
},{"url":10}],18:[function(require,module,exports){
function Traverse(e){this.value=e}function walk(e,t,r){var o=[],n=[],a=!0;return function i(e){function c(){if("object"==typeof l.node&&null!==l.node){l.keys&&l.node_===l.node||(l.keys=objectKeys(l.node)),l.isLeaf=0==l.keys.length;for(var t=0;t<n.length;t++)if(n[t].node_===e){l.circular=n[t];break}}else l.isLeaf=!0,l.keys=null;l.notLeaf=!l.isLeaf,l.notRoot=!l.isRoot}var s=r?copy(e):e,u={},f=!0,l={node:s,node_:e,path:[].concat(o),parent:n[n.length-1],parents:n,key:o.slice(-1)[0],isRoot:0===o.length,level:o.length,circular:null,update:function(e,t){l.isRoot||(l.parent.node[l.key]=e),l.node=e,t&&(f=!1)},"delete":function(e){delete l.parent.node[l.key],e&&(f=!1)},remove:function(e){isArray(l.parent.node)?l.parent.node.splice(l.key,1):delete l.parent.node[l.key],e&&(f=!1)},keys:null,before:function(e){u.before=e},after:function(e){u.after=e},pre:function(e){u.pre=e},post:function(e){u.post=e},stop:function(){a=!1},block:function(){f=!1}};if(!a)return l;c();var p=t.call(l,l.node);return void 0!==p&&l.update&&l.update(p),u.before&&u.before.call(l,l.node),f?("object"!=typeof l.node||null===l.node||l.circular||(n.push(l),c(),forEach(l.keys,function(e,t){o.push(e),u.pre&&u.pre.call(l,l.node[e],e);var n=i(l.node[e]);r&&hasOwnProperty.call(l.node,e)&&(l.node[e]=n.node),n.isLast=t==l.keys.length-1,n.isFirst=0==t,u.post&&u.post.call(l,n),o.pop()}),n.pop()),u.after&&u.after.call(l,l.node),l):l}(e).node}function copy(e){if("object"==typeof e&&null!==e){var t;if(isArray(e))t=[];else if(isDate(e))t=new Date(e.getTime?e.getTime():e);else if(isRegExp(e))t=new RegExp(e);else if(isError(e))t={message:e.message};else if(isBoolean(e))t=new Boolean(e);else if(isNumber(e))t=new Number(e);else if(isString(e))t=new String(e);else if(Object.create&&Object.getPrototypeOf)t=Object.create(Object.getPrototypeOf(e));else if(e.constructor===Object)t={};else{var r=e.constructor&&e.constructor.prototype||e.__proto__||{},o=function(){};o.prototype=r,t=new o}return forEach(objectKeys(e),function(r){t[r]=e[r]}),t}return e}function toS(e){return Object.prototype.toString.call(e)}function isDate(e){return"[object Date]"===toS(e)}function isRegExp(e){return"[object RegExp]"===toS(e)}function isError(e){return"[object Error]"===toS(e)}function isBoolean(e){return"[object Boolean]"===toS(e)}function isNumber(e){return"[object Number]"===toS(e)}function isString(e){return"[object String]"===toS(e)}var traverse=module.exports=function(e){return new Traverse(e)};Traverse.prototype.get=function(e){for(var t=this.value,r=0;r<e.length;r++){var o=e[r];if(!t||!hasOwnProperty.call(t,o)){t=void 0;break}t=t[o]}return t},Traverse.prototype.has=function(e){for(var t=this.value,r=0;r<e.length;r++){var o=e[r];if(!t||!hasOwnProperty.call(t,o))return!1;t=t[o]}return!0},Traverse.prototype.set=function(e,t){for(var r=this.value,o=0;o<e.length-1;o++){var n=e[o];hasOwnProperty.call(r,n)||(r[n]={}),r=r[n]}return r[e[o]]=t,t},Traverse.prototype.map=function(e){return walk(this.value,e,!0)},Traverse.prototype.forEach=function(e){return this.value=walk(this.value,e,!1),this.value},Traverse.prototype.reduce=function(e,t){var r=1===arguments.length,o=r?this.value:t;return this.forEach(function(t){this.isRoot&&r||(o=e.call(this,o,t))}),o},Traverse.prototype.paths=function(){var e=[];return this.forEach(function(){e.push(this.path)}),e},Traverse.prototype.nodes=function(){var e=[];return this.forEach(function(){e.push(this.node)}),e},Traverse.prototype.clone=function(){var e=[],t=[];return function r(o){for(var n=0;n<e.length;n++)if(e[n]===o)return t[n];if("object"==typeof o&&null!==o){var a=copy(o);return e.push(o),t.push(a),forEach(objectKeys(o),function(e){a[e]=r(o[e])}),e.pop(),t.pop(),a}return o}(this.value)};var objectKeys=Object.keys||function(e){var t=[];for(var r in e)t.push(r);return t},isArray=Array.isArray||function(e){return"[object Array]"===Object.prototype.toString.call(e)},forEach=function(e,t){if(e.forEach)return e.forEach(t);for(var r=0;r<e.length;r++)t(e[r],r,e)};forEach(objectKeys(Traverse.prototype),function(e){traverse[e]=function(t){var r=[].slice.call(arguments,1),o=new Traverse(t);return o[e].apply(o,r)}});var hasOwnProperty=Object.hasOwnProperty||function(e,t){return t in e};
},{}],19:[function(require,module,exports){
"use strict";module.exports={INVALID_TYPE:"Expected type {0} but found type {1}",INVALID_FORMAT:"Object didn't pass validation for format {0}: {1}",ENUM_MISMATCH:"No enum match for: {0}",ANY_OF_MISSING:"Data does not match any schemas from 'anyOf'",ONE_OF_MISSING:"Data does not match any schemas from 'oneOf'",ONE_OF_MULTIPLE:"Data is valid against more than one schema from 'oneOf'",NOT_PASSED:"Data matches schema from 'not'",ARRAY_LENGTH_SHORT:"Array is too short ({0}), minimum {1}",ARRAY_LENGTH_LONG:"Array is too long ({0}), maximum {1}",ARRAY_UNIQUE:"Array items are not unique (indexes {0} and {1})",ARRAY_ADDITIONAL_ITEMS:"Additional items not allowed",MULTIPLE_OF:"Value {0} is not a multiple of {1}",MINIMUM:"Value {0} is less than minimum {1}",MINIMUM_EXCLUSIVE:"Value {0} is equal or less than exclusive minimum {1}",MAXIMUM:"Value {0} is greater than maximum {1}",MAXIMUM_EXCLUSIVE:"Value {0} is equal or greater than exclusive maximum {1}",OBJECT_PROPERTIES_MINIMUM:"Too few properties defined ({0}), minimum {1}",OBJECT_PROPERTIES_MAXIMUM:"Too many properties defined ({0}), maximum {1}",OBJECT_MISSING_REQUIRED_PROPERTY:"Missing required property: {0}",OBJECT_ADDITIONAL_PROPERTIES:"Additional properties not allowed: {0}",OBJECT_DEPENDENCY_KEY:"Dependency failed - key must exist: {0} (due to key: {1})",MIN_LENGTH:"String is too short ({0} chars), minimum {1}",MAX_LENGTH:"String is too long ({0} chars), maximum {1}",PATTERN:"String does not match pattern {0}: {1}",KEYWORD_TYPE_EXPECTED:"Keyword '{0}' is expected to be of type '{1}'",KEYWORD_UNDEFINED_STRICT:"Keyword '{0}' must be defined in strict mode",KEYWORD_UNEXPECTED:"Keyword '{0}' is not expected to appear in the schema",KEYWORD_MUST_BE:"Keyword '{0}' must be {1}",KEYWORD_DEPENDENCY:"Keyword '{0}' requires keyword '{1}'",KEYWORD_PATTERN:"Keyword '{0}' is not a valid RegExp pattern: {1}",KEYWORD_VALUE_TYPE:"Each element of keyword '{0}' array must be a '{1}'",UNKNOWN_FORMAT:"There is no validation function for format '{0}'",CUSTOM_MODE_FORCE_PROPERTIES:"{0} must define at least one property if present",REF_UNRESOLVED:"Reference has not been resolved during compilation: {0}",UNRESOLVABLE_REFERENCE:"Reference could not be resolved: {0}",SCHEMA_NOT_REACHABLE:"Validator was not able to read schema with uri: {0}",SCHEMA_TYPE_EXPECTED:"Schema is expected to be of type 'object'",SCHEMA_NOT_AN_OBJECT:"Schema is not an object: {0}",ASYNC_TIMEOUT:"{0} asynchronous task(s) have timed out after {1} ms",PARENT_SCHEMA_VALIDATION_FAILED:"Schema failed to validate against its parent schema, see inner errors for details.",REMOTE_NOT_VALID:"Remote reference didn't compile successfully: {0}"};
},{}],20:[function(require,module,exports){
var FormatValidators={date:function(t){if("string"!=typeof t)return!0;var d=/^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(t);return null===d?!1:d[2]<"01"||d[2]>"12"||d[3]<"01"||d[3]>"31"?!1:!0},"date-time":function(t){if("string"!=typeof t)return!0;var d=t.toLowerCase().split("t");if(!FormatValidators.date(d[0]))return!1;var a=/^([0-9]{2}):([0-9]{2}):([0-9]{2})(.[0-9]+)?(z|([+-][0-9]{2}:[0-9]{2}))$/.exec(d[1]);return null===a?!1:a[1]>"23"||a[2]>"59"||a[3]>"59"?!1:!0},email:function(t){return"string"!=typeof t?!0:/^[a-zA-Z0-9+&*-]+(?:\.[a-zA-Z0-9_+&*-]+)*@(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,7}$/.test(t)},hostname:function(t){if("string"!=typeof t)return!0;var d=/^[a-zA-Z](([-0-9a-zA-Z]+)?[0-9a-zA-Z])?(\.[a-zA-Z](([-0-9a-zA-Z]+)?[0-9a-zA-Z])?)*$/.test(t);if(d){if(t.length>255)return!1;for(var a=t.split("."),r=0;r<a.length;r++)if(a[r].length>63)return!1}return d},"host-name":function(t){return FormatValidators.hostname.call(this,t)},ipv4:function(t){return"string"!=typeof t?!0:-1===t.indexOf(".")?!1:/^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(t)},ipv6:function(t){return"string"!=typeof t||/^\s*((([0-9A-Fa-f]{1,4}:){7}([0-9A-Fa-f]{1,4}|:))|(([0-9A-Fa-f]{1,4}:){6}(:[0-9A-Fa-f]{1,4}|((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9A-Fa-f]{1,4}:){5}(((:[0-9A-Fa-f]{1,4}){1,2})|:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9A-Fa-f]{1,4}:){4}(((:[0-9A-Fa-f]{1,4}){1,3})|((:[0-9A-Fa-f]{1,4})?:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9A-Fa-f]{1,4}:){3}(((:[0-9A-Fa-f]{1,4}){1,4})|((:[0-9A-Fa-f]{1,4}){0,2}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9A-Fa-f]{1,4}:){2}(((:[0-9A-Fa-f]{1,4}){1,5})|((:[0-9A-Fa-f]{1,4}){0,3}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9A-Fa-f]{1,4}:){1}(((:[0-9A-Fa-f]{1,4}){1,6})|((:[0-9A-Fa-f]{1,4}){0,4}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(:(((:[0-9A-Fa-f]{1,4}){1,7})|((:[0-9A-Fa-f]{1,4}){0,5}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:)))(%.+)?\s*$/.test(t)},regex:function(t){try{return RegExp(t),!0}catch(d){return!1}},uri:function(t){return this.options.strictUris?FormatValidators["strict-uri"].apply(this,arguments):"string"!=typeof t||RegExp("^(([^:/?#]+):)?(//([^/?#]*))?([^?#]*)(\\?([^#]*))?(#(.*))?").test(t)},"strict-uri":function(t){return"string"!=typeof t||RegExp("^(?:(?:https?|ftp)://)(?:\\S+(?::\\S*)?@)?(?:(?!10(?:\\.\\d{1,3}){3})(?!127(?:\\.\\d{1,3}){3})(?!169\\.254(?:\\.\\d{1,3}){2})(?!192\\.168(?:\\.\\d{1,3}){2})(?!172\\.(?:1[6-9]|2\\d|3[0-1])(?:\\.\\d{1,3}){2})(?:[1-9]\\d?|1\\d\\d|2[01]\\d|22[0-3])(?:\\.(?:1?\\d{1,2}|2[0-4]\\d|25[0-5])){2}(?:\\.(?:[1-9]\\d?|1\\d\\d|2[0-4]\\d|25[0-4]))|(?:(?:[a-z\\u00a1-\\uffff0-9]+-?)*[a-z\\u00a1-\\uffff0-9]+)(?:\\.(?:[a-z\\u00a1-\\uffff0-9]+-?)*[a-z\\u00a1-\\uffff0-9]+)*(?:\\.(?:[a-z\\u00a1-\\uffff]{2,})))(?::\\d{2,5})?(?:/[^\\s]*)?$","i").test(t)}};module.exports=FormatValidators;
},{}],21:[function(require,module,exports){
"use strict";var FormatValidators=require("./FormatValidators"),Report=require("./Report"),Utils=require("./Utils"),JsonValidators={multipleOf:function(r,e,t){"number"==typeof t&&"integer"!==Utils.whatIs(t/e.multipleOf)&&r.addError("MULTIPLE_OF",[t,e.multipleOf],null,e.description)},maximum:function(r,e,t){"number"==typeof t&&(e.exclusiveMaximum!==!0?t>e.maximum&&r.addError("MAXIMUM",[t,e.maximum],null,e.description):t>=e.maximum&&r.addError("MAXIMUM_EXCLUSIVE",[t,e.maximum],null,e.description))},exclusiveMaximum:function(){},minimum:function(r,e,t){"number"==typeof t&&(e.exclusiveMinimum!==!0?t<e.minimum&&r.addError("MINIMUM",[t,e.minimum],null,e.description):t<=e.minimum&&r.addError("MINIMUM_EXCLUSIVE",[t,e.minimum],null,e.description))},exclusiveMinimum:function(){},maxLength:function(r,e,t){"string"==typeof t&&t.length>e.maxLength&&r.addError("MAX_LENGTH",[t.length,e.maxLength],null,e.description)},minLength:function(r,e,t){"string"==typeof t&&t.length<e.minLength&&r.addError("MIN_LENGTH",[t.length,e.minLength],null,e.description)},pattern:function(r,e,t){"string"==typeof t&&RegExp(e.pattern).test(t)===!1&&r.addError("PATTERN",[e.pattern,t],null,e.description)},additionalItems:function(r,e,t){Array.isArray(t)&&e.additionalItems===!1&&Array.isArray(e.items)&&t.length>e.items.length&&r.addError("ARRAY_ADDITIONAL_ITEMS",null,null,e.description)},items:function(){},maxItems:function(r,e,t){Array.isArray(t)&&t.length>e.maxItems&&r.addError("ARRAY_LENGTH_LONG",[t.length,e.maxItems],null,e.description)},minItems:function(r,e,t){Array.isArray(t)&&t.length<e.minItems&&r.addError("ARRAY_LENGTH_SHORT",[t.length,e.minItems],null,e.description)},uniqueItems:function(r,e,t){if(Array.isArray(t)&&e.uniqueItems===!0){var i=[];Utils.isUniqueArray(t,i)===!1&&r.addError("ARRAY_UNIQUE",i,null,e.description)}},maxProperties:function(r,e,t){if("object"===Utils.whatIs(t)){var i=Object.keys(t).length;i>e.maxProperties&&r.addError("OBJECT_PROPERTIES_MAXIMUM",[i,e.maxProperties],null,e.description)}},minProperties:function(r,e,t){if("object"===Utils.whatIs(t)){var i=Object.keys(t).length;i<e.minProperties&&r.addError("OBJECT_PROPERTIES_MINIMUM",[i,e.minProperties],null,e.description)}},required:function(r,e,t){if("object"===Utils.whatIs(t))for(var i=e.required.length;i--;){var n=e.required[i];void 0===t[n]&&r.addError("OBJECT_MISSING_REQUIRED_PROPERTY",[n],null,e.description)}},additionalProperties:function(r,e,t){return void 0===e.properties&&void 0===e.patternProperties?JsonValidators.properties.call(this,r,e,t):void 0},patternProperties:function(r,e,t){return void 0===e.properties?JsonValidators.properties.call(this,r,e,t):void 0},properties:function(r,e,t){if("object"===Utils.whatIs(t)){var i=void 0!==e.properties?e.properties:{},n=void 0!==e.patternProperties?e.patternProperties:{};if(e.additionalProperties===!1){var o=Object.keys(t),a=Object.keys(i),s=Object.keys(n);o=Utils.difference(o,a);for(var l=s.length;l--;)for(var d=RegExp(s[l]),p=o.length;p--;)d.test(o[p])===!0&&o.splice(p,1);o.length>0&&r.addError("OBJECT_ADDITIONAL_PROPERTIES",[o],null,e.description)}}},dependencies:function(r,e,t){if("object"===Utils.whatIs(t))for(var i=Object.keys(e.dependencies),n=i.length;n--;){var o=i[n];if(t[o]){var a=e.dependencies[o];if("object"===Utils.whatIs(a))exports.validate.call(this,r,a,t);else for(var s=a.length;s--;){var l=a[s];void 0===t[l]&&r.addError("OBJECT_DEPENDENCY_KEY",[l,o],null,e.description)}}}},"enum":function(r,e,t){for(var i=!1,n=e["enum"].length;n--;)if(Utils.areEqual(t,e["enum"][n])){i=!0;break}i===!1&&r.addError("ENUM_MISMATCH",[t],null,e.description)},allOf:function(r,e,t){for(var i=e.allOf.length;i--&&exports.validate.call(this,r,e.allOf[i],t)!==!1;);},anyOf:function(r,e,t){for(var i=[],n=!1,o=e.anyOf.length;o--&&n===!1;){var a=new Report(r);i.push(a),n=exports.validate.call(this,a,e.anyOf[o],t)}n===!1&&r.addError("ANY_OF_MISSING",void 0,i,e.description)},oneOf:function(r,e,t){for(var i=0,n=[],o=e.oneOf.length;o--;){var a=new Report(r);n.push(a),exports.validate.call(this,a,e.oneOf[o],t)===!0&&i++}0===i?r.addError("ONE_OF_MISSING",void 0,n,e.description):i>1&&r.addError("ONE_OF_MULTIPLE",null,null,e.description)},not:function(r,e,t){var i=new Report(r);exports.validate.call(this,i,e.not,t)===!0&&r.addError("NOT_PASSED",null,null,e.description)},definitions:function(){},format:function(r,e,t){var i=FormatValidators[e.format];"function"==typeof i?2===i.length?r.addAsyncTask(i,[t],function(i){i!==!0&&r.addError("INVALID_FORMAT",[e.format,t],null,e.description)}):i.call(this,t)!==!0&&r.addError("INVALID_FORMAT",[e.format,t],null,e.description):r.addError("UNKNOWN_FORMAT",[e.format],null,e.description)}},recurseArray=function(r,e,t){var i=t.length;if(Array.isArray(e.items))for(;i--;)i<e.items.length?(r.path.push(i.toString()),exports.validate.call(this,r,e.items[i],t[i]),r.path.pop()):"object"==typeof e.additionalItems&&(r.path.push(i.toString()),exports.validate.call(this,r,e.additionalItems,t[i]),r.path.pop());else if("object"==typeof e.items)for(;i--;)r.path.push(i.toString()),exports.validate.call(this,r,e.items,t[i]),r.path.pop()},recurseObject=function(r,e,t){var i=e.additionalProperties;(i===!0||void 0===i)&&(i={});for(var n=e.properties?Object.keys(e.properties):[],o=e.patternProperties?Object.keys(e.patternProperties):[],a=Object.keys(t),s=a.length;s--;){var l=a[s],d=t[l],p=[];-1!==n.indexOf(l)&&p.push(e.properties[l]);for(var u=o.length;u--;){var c=o[u];RegExp(c).test(l)===!0&&p.push(e.patternProperties[c])}for(0===p.length&&i!==!1&&p.push(i),u=p.length;u--;)r.path.push(l),exports.validate.call(this,r,p[u],d),r.path.pop()}};exports.validate=function(r,e,t){var i=Utils.whatIs(e);if("object"!==i)return r.addError("SCHEMA_NOT_AN_OBJECT",[i],null,e.description),!1;var n=Object.keys(e);if(0===n.length)return!0;var o=!1;if(r.rootSchema||(r.rootSchema=e,o=!0),void 0!==e.$ref){for(var a=99;e.$ref&&a>0;){if(!e.__$refResolved){r.addError("REF_UNRESOLVED",[e.$ref],null,e.description);break}if(e.__$refResolved===e)break;e=e.__$refResolved,n=Object.keys(e),a--}if(0===a)throw new Error("Circular dependency by $ref references!")}var s=Utils.whatIs(t);if(e.type)if("string"==typeof e.type){if(s!==e.type&&("integer"!==s||"number"!==e.type)&&(r.addError("INVALID_TYPE",[e.type,s],null,e.description),this.options.breakOnFirstError))return!1}else if(-1===e.type.indexOf(s)&&("integer"!==s||-1===e.type.indexOf("number"))&&(r.addError("INVALID_TYPE",[e.type,s],null,e.description),this.options.breakOnFirstError))return!1;for(var l=n.length;l--&&!(JsonValidators[n[l]]&&(JsonValidators[n[l]].call(this,r,e,t),r.errors.length&&this.options.breakOnFirstError)););return(0===r.errors.length||this.options.breakOnFirstError===!1)&&("array"===s?recurseArray.call(this,r,e,t):"object"===s&&recurseObject.call(this,r,e,t)),o&&(r.rootSchema=void 0),0===r.errors.length};
},{"./FormatValidators":20,"./Report":23,"./Utils":27}],22:[function(require,module,exports){
"function"!=typeof Number.isFinite&&(Number.isFinite=function(e){return"number"!=typeof e?!1:e!==e||1/0===e||e===-1/0?!1:!0});
},{}],23:[function(require,module,exports){
(function(r){"use strict";function t(r){this.parentReport=r instanceof t?r:void 0,this.options=r instanceof t?r.options:r||{},this.errors=[],this.path=[],this.asyncTasks=[]}var n=require("./Errors");t.prototype.isValid=function(){if(this.asyncTasks.length>0)throw new Error("Async tasks pending, can't answer isValid");return 0===this.errors.length},t.prototype.addAsyncTask=function(r,t,n){this.asyncTasks.push([r,t,n])},t.prototype.processAsyncTasks=function(t,n){function o(){r.nextTick(function(){var r=0===h.errors.length,t=r?void 0:h.errors;n(t,r)})}function s(r){return function(t){c||(r(t),0===--i&&o())}}var e=t||2e3,i=this.asyncTasks.length,a=i,c=!1,h=this;if(0===i||this.errors.length>0)return void o();for(;a--;){var p=this.asyncTasks[a];p[0].apply(null,p[1].concat(s(p[2])))}setTimeout(function(){i>0&&(c=!0,h.addError("ASYNC_TIMEOUT",[i,e]),n(h.errors,!1))},e)},t.prototype.getPath=function(){var r=[];return this.parentReport&&(r=r.concat(this.parentReport.path)),r=r.concat(this.path),this.options.reportPathAsArray!==!0&&(r="#/"+r.map(function(r){return r.replace("~","~0").replace("/","~1")}).join("/")),r},t.prototype.addError=function(r,t,o,s){if(!r)throw new Error("No errorCode passed into addError()");if(!n[r])throw new Error("No errorMessage known for code "+r);t=t||[];for(var e=t.length,i=n[r];e--;)i=i.replace("{"+e+"}",t[e]);var a={code:r,params:t,message:i,path:this.getPath()};if(s&&(a.description=s),null!=o){for(Array.isArray(o)||(o=[o]),a.inner=[],e=o.length;e--;)for(var c=o[e],h=c.errors.length;h--;)a.inner.push(c.errors[h]);0===a.inner.length&&(a.inner=void 0)}this.errors.push(a)},module.exports=t}).call(this,require("_process"));
},{"./Errors":19,"_process":5}],24:[function(require,module,exports){
"use strict";function decodeJSONPointer(e){return decodeURIComponent(e).replace(/~[0-1]/g,function(e){return"~1"===e?"/":"~"})}function getRemotePath(e){var t=e.indexOf("#");return-1===t?e:e.slice(0,t)}function getQueryPath(e){var t=e.indexOf("#"),r=-1===t?void 0:e.slice(t+1);return r}function findId(e,t){if("object"==typeof e&&null!==e){if(!t)return e;if(e.id&&(e.id===t||"#"===e.id[0]&&e.id.substring(1)===t))return e;var r,i;if(Array.isArray(e)){for(r=e.length;r--;)if(i=findId(e[r],t))return i}else{var a=Object.keys(e);for(r=a.length;r--;){var o=a[r];if(0!==o.indexOf("__$")&&(i=findId(e[o],t)))return i}}}}var Report=require("./Report"),SchemaCompilation=require("./SchemaCompilation"),SchemaValidation=require("./SchemaValidation");exports.cacheSchemaByUri=function(e,t){var r=getRemotePath(e);r&&(this.cache[r]=t)},exports.removeFromCacheByUri=function(e){var t=getRemotePath(e);t&&(this.cache[t]=void 0)},exports.checkCacheForUri=function(e){var t=getRemotePath(e);return t?null!=this.cache[t]:!1},exports.getSchemaByUri=function(e,t,r){var i=getRemotePath(t),a=getQueryPath(t),o=i?this.cache[i]:r;if(o&&i){var n=o!==r;if(n){e.path.push(i);var c=new Report(e);SchemaCompilation.compileSchema.call(this,c,o)&&SchemaValidation.validateSchema.call(this,c,o);var h=c.isValid();if(h||e.addError("REMOTE_NOT_VALID",[t],c),e.path.pop(),!h)return void 0}}if(o&&a)for(var d=a.split("/"),f=0,u=d.length;u>f;f++){var l=decodeJSONPointer(d[f]);o=0===f?findId(o,l):o[l]}return o},exports.getRemotePath=getRemotePath;
},{"./Report":23,"./SchemaCompilation":25,"./SchemaValidation":26}],25:[function(require,module,exports){
"use strict";function isAbsoluteUri(e){return/^https?:\/\//.test(e)}function isRelativeUri(e){return/.+#/.test(e)}function mergeReference(e,r){if(isAbsoluteUri(r))return r;var i,c=e.join(""),t=isAbsoluteUri(c),a=isRelativeUri(c),o=isRelativeUri(r);t&&o?(i=c.match(/\/[^\/]*$/),i&&(c=c.slice(0,i.index+1))):a&&o?c="":(i=c.match(/[^#/]+$/),i&&(c=c.slice(0,i.index)));var s=c+r;return s=s.replace(/##/,"#")}function collectReferences(e,r,i,c){if(r=r||[],i=i||[],c=c||[],"object"!=typeof e||null===e)return r;"string"==typeof e.id&&i.push(e.id),"string"==typeof e.$ref&&r.push({ref:mergeReference(i,e.$ref),key:"$ref",obj:e,path:c.slice(0)}),"string"==typeof e.$schema&&r.push({ref:mergeReference(i,e.$schema),key:"$schema",obj:e,path:c.slice(0)});var t;if(Array.isArray(e))for(t=e.length;t--;)c.push(t.toString()),collectReferences(e[t],r,i,c),c.pop();else{var a=Object.keys(e);for(t=a.length;t--;)0!==a[t].indexOf("__$")&&(c.push(a[t]),collectReferences(e[a[t]],r,i,c),c.pop())}return"string"==typeof e.id&&i.pop(),r}var Report=require("./Report"),SchemaCache=require("./SchemaCache"),compileArrayOfSchemasLoop=function(e,r){for(var i=r.length,c=0;i--;){var t=new Report(e),a=exports.compileSchema.call(this,t,r[i]);a&&c++,e.errors=e.errors.concat(t.errors)}return c},compileArrayOfSchemas=function(e,r){var i,c=0;do{for(var t=e.errors.length;t--;)"UNRESOLVABLE_REFERENCE"===e.errors[t].code&&e.errors.splice(t,1);i=c,c=compileArrayOfSchemasLoop.call(this,e,r)}while(c!==r.length&&c!==i);return e.isValid()};exports.compileSchema=function(e,r){if("string"==typeof r){var i=SchemaCache.getSchemaByUri.call(this,e,r);if(!i)return e.addError("SCHEMA_NOT_REACHABLE",[r]),!1;r=i}if(Array.isArray(r))return compileArrayOfSchemas.call(this,e,r);if(r.__$compiled&&r.id&&SchemaCache.checkCacheForUri.call(this,r.id)===!1&&(r.__$compiled=void 0),r.__$compiled)return!0;r.id&&SchemaCache.cacheSchemaByUri.call(this,r.id,r);for(var c=collectReferences.call(this,r),t=c.length;t--;){var a=c[t],o=SchemaCache.getSchemaByUri.call(this,e,a.ref,r);o||isAbsoluteUri(a.ref)&&this.options.ignoreUnresolvableReferences===!0||(Array.prototype.push.apply(e.path,a.path),e.addError("UNRESOLVABLE_REFERENCE",[a.ref]),e.path.slice(0,-a.path.length)),a.obj["__"+a.key+"Resolved"]=o}var s=e.isValid();return s?r.__$compiled=!0:r.id&&SchemaCache.removeFromCacheByUri.call(this,r.id),s};
},{"./Report":23,"./SchemaCache":24}],26:[function(require,module,exports){
"use strict";var FormatValidators=require("./FormatValidators"),JsonValidation=require("./JsonValidation"),Report=require("./Report"),Utils=require("./Utils"),SchemaValidators={$ref:function(r,e){"string"!=typeof e.$ref&&r.addError("KEYWORD_TYPE_EXPECTED",["$ref","string"])},$schema:function(r,e){"string"!=typeof e.$schema&&r.addError("KEYWORD_TYPE_EXPECTED",["$schema","string"])},multipleOf:function(r,e){"number"!=typeof e.multipleOf?r.addError("KEYWORD_TYPE_EXPECTED",["multipleOf","number"]):e.multipleOf<=0&&r.addError("KEYWORD_MUST_BE",["multipleOf","strictly greater than 0"])},maximum:function(r,e){"number"!=typeof e.maximum&&r.addError("KEYWORD_TYPE_EXPECTED",["maximum","number"])},exclusiveMaximum:function(r,e){"boolean"!=typeof e.exclusiveMaximum?r.addError("KEYWORD_TYPE_EXPECTED",["exclusiveMaximum","boolean"]):void 0===e.maximum&&r.addError("KEYWORD_DEPENDENCY",["exclusiveMaximum","maximum"])},minimum:function(r,e){"number"!=typeof e.minimum&&r.addError("KEYWORD_TYPE_EXPECTED",["minimum","number"])},exclusiveMinimum:function(r,e){"boolean"!=typeof e.exclusiveMinimum?r.addError("KEYWORD_TYPE_EXPECTED",["exclusiveMinimum","boolean"]):void 0===e.minimum&&r.addError("KEYWORD_DEPENDENCY",["exclusiveMinimum","minimum"])},maxLength:function(r,e){"integer"!==Utils.whatIs(e.maxLength)?r.addError("KEYWORD_TYPE_EXPECTED",["maxLength","integer"]):e.maxLength<0&&r.addError("KEYWORD_MUST_BE",["maxLength","greater than, or equal to 0"])},minLength:function(r,e){"integer"!==Utils.whatIs(e.minLength)?r.addError("KEYWORD_TYPE_EXPECTED",["minLength","integer"]):e.minLength<0&&r.addError("KEYWORD_MUST_BE",["minLength","greater than, or equal to 0"])},pattern:function(r,e){if("string"!=typeof e.pattern)r.addError("KEYWORD_TYPE_EXPECTED",["pattern","string"]);else try{RegExp(e.pattern)}catch(t){r.addError("KEYWORD_PATTERN",["pattern",e.pattern])}},additionalItems:function(r,e){var t=Utils.whatIs(e.additionalItems);"boolean"!==t&&"object"!==t?r.addError("KEYWORD_TYPE_EXPECTED",["additionalItems",["boolean","object"]]):"object"===t&&(r.path.push("additionalItems"),exports.validateSchema.call(this,r,e.additionalItems),r.path.pop())},items:function(r,e){var t=Utils.whatIs(e.items);if("object"===t)r.path.push("items"),exports.validateSchema.call(this,r,e.items),r.path.pop();else if("array"===t)for(var a=e.items.length;a--;)r.path.push("items"),r.path.push(a.toString()),exports.validateSchema.call(this,r,e.items[a]),r.path.pop(),r.path.pop();else r.addError("KEYWORD_TYPE_EXPECTED",["items",["array","object"]]);this.options.forceAdditional===!0&&void 0===e.additionalItems&&Array.isArray(e.items)&&r.addError("KEYWORD_UNDEFINED_STRICT",["additionalItems"]),this.options.assumeAdditional===!0&&void 0===e.additionalItems&&Array.isArray(e.items)&&(e.additionalItems=!1)},maxItems:function(r,e){"number"!=typeof e.maxItems?r.addError("KEYWORD_TYPE_EXPECTED",["maxItems","integer"]):e.maxItems<0&&r.addError("KEYWORD_MUST_BE",["maxItems","greater than, or equal to 0"])},minItems:function(r,e){"integer"!==Utils.whatIs(e.minItems)?r.addError("KEYWORD_TYPE_EXPECTED",["minItems","integer"]):e.minItems<0&&r.addError("KEYWORD_MUST_BE",["minItems","greater than, or equal to 0"])},uniqueItems:function(r,e){"boolean"!=typeof e.uniqueItems&&r.addError("KEYWORD_TYPE_EXPECTED",["uniqueItems","boolean"])},maxProperties:function(r,e){"integer"!==Utils.whatIs(e.maxProperties)?r.addError("KEYWORD_TYPE_EXPECTED",["maxProperties","integer"]):e.maxProperties<0&&r.addError("KEYWORD_MUST_BE",["maxProperties","greater than, or equal to 0"])},minProperties:function(r,e){"integer"!==Utils.whatIs(e.minProperties)?r.addError("KEYWORD_TYPE_EXPECTED",["minProperties","integer"]):e.minProperties<0&&r.addError("KEYWORD_MUST_BE",["minProperties","greater than, or equal to 0"])},required:function(r,e){if("array"!==Utils.whatIs(e.required))r.addError("KEYWORD_TYPE_EXPECTED",["required","array"]);else if(0===e.required.length)r.addError("KEYWORD_MUST_BE",["required","an array with at least one element"]);else{for(var t=e.required.length;t--;)"string"!=typeof e.required[t]&&r.addError("KEYWORD_VALUE_TYPE",["required","string"]);Utils.isUniqueArray(e.required)===!1&&r.addError("KEYWORD_MUST_BE",["required","an array with unique items"])}},additionalProperties:function(r,e){var t=Utils.whatIs(e.additionalProperties);"boolean"!==t&&"object"!==t?r.addError("KEYWORD_TYPE_EXPECTED",["additionalProperties",["boolean","object"]]):"object"===t&&(r.path.push("additionalProperties"),exports.validateSchema.call(this,r,e.additionalProperties),r.path.pop())},properties:function(r,e){if("object"!==Utils.whatIs(e.properties))return void r.addError("KEYWORD_TYPE_EXPECTED",["properties","object"]);for(var t=Object.keys(e.properties),a=t.length;a--;){var i=t[a],o=e.properties[i];r.path.push("properties"),r.path.push(i),exports.validateSchema.call(this,r,o),r.path.pop(),r.path.pop()}this.options.forceAdditional===!0&&void 0===e.additionalProperties&&r.addError("KEYWORD_UNDEFINED_STRICT",["additionalProperties"]),this.options.assumeAdditional===!0&&void 0===e.additionalProperties&&(e.additionalProperties=!1),this.options.forceProperties===!0&&0===t.length&&r.addError("CUSTOM_MODE_FORCE_PROPERTIES",["properties"])},patternProperties:function(r,e){if("object"!==Utils.whatIs(e.patternProperties))return void r.addError("KEYWORD_TYPE_EXPECTED",["patternProperties","object"]);for(var t=Object.keys(e.patternProperties),a=t.length;a--;){var i=t[a],o=e.patternProperties[i];try{RegExp(i)}catch(n){r.addError("KEYWORD_PATTERN",["patternProperties",i])}r.path.push("patternProperties"),r.path.push(i.toString()),exports.validateSchema.call(this,r,o),r.path.pop(),r.path.pop()}this.options.forceProperties===!0&&0===t.length&&r.addError("CUSTOM_MODE_FORCE_PROPERTIES",["patternProperties"])},dependencies:function(r,e){if("object"!==Utils.whatIs(e.dependencies))r.addError("KEYWORD_TYPE_EXPECTED",["dependencies","object"]);else for(var t=Object.keys(e.dependencies),a=t.length;a--;){var i=t[a],o=e.dependencies[i],n=Utils.whatIs(o);if("object"===n)r.path.push("dependencies"),r.path.push(i),exports.validateSchema.call(this,r,o),r.path.pop(),r.path.pop();else if("array"===n){var E=o.length;for(0===E&&r.addError("KEYWORD_MUST_BE",["dependencies","not empty array"]);E--;)"string"!=typeof o[E]&&r.addError("KEYWORD_VALUE_TYPE",["dependensices","string"]);Utils.isUniqueArray(o)===!1&&r.addError("KEYWORD_MUST_BE",["dependencies","an array with unique items"])}else r.addError("KEYWORD_VALUE_TYPE",["dependencies","object or array"])}},"enum":function(r,e){Array.isArray(e["enum"])===!1?r.addError("KEYWORD_TYPE_EXPECTED",["enum","array"]):0===e["enum"].length?r.addError("KEYWORD_MUST_BE",["enum","an array with at least one element"]):Utils.isUniqueArray(e["enum"])===!1&&r.addError("KEYWORD_MUST_BE",["enum","an array with unique elements"])},type:function(r,e){var t=["array","boolean","integer","number","null","object","string"],a=t.join(","),i=Array.isArray(e.type);if(i){for(var o=e.type.length;o--;)-1===t.indexOf(e.type[o])&&r.addError("KEYWORD_TYPE_EXPECTED",["type",a]);Utils.isUniqueArray(e.type)===!1&&r.addError("KEYWORD_MUST_BE",["type","an object with unique properties"])}else"string"==typeof e.type?-1===t.indexOf(e.type)&&r.addError("KEYWORD_TYPE_EXPECTED",["type",a]):r.addError("KEYWORD_TYPE_EXPECTED",["type",["string","array"]]);this.options.noEmptyStrings===!0&&("string"===e.type||i&&-1!==e.type.indexOf("string"))&&void 0===e.minLength&&(e.minLength=1),this.options.noEmptyArrays===!0&&("array"===e.type||i&&-1!==e.type.indexOf("array"))&&void 0===e.minItems&&(e.minItems=1),this.options.forceProperties===!0&&("object"===e.type||i&&-1!==e.type.indexOf("object"))&&void 0===e.properties&&void 0===e.patternProperties&&r.addError("KEYWORD_UNDEFINED_STRICT",["properties"]),this.options.forceItems===!0&&("array"===e.type||i&&-1!==e.type.indexOf("array"))&&void 0===e.items&&r.addError("KEYWORD_UNDEFINED_STRICT",["items"]),this.options.forceMaxLength===!0&&("string"===e.type||i&&-1!==e.type.indexOf("string"))&&void 0===e.maxLength&&void 0===e.format&&void 0===e["enum"]&&r.addError("KEYWORD_UNDEFINED_STRICT",["maxLength"])},allOf:function(r,e){if(Array.isArray(e.allOf)===!1)r.addError("KEYWORD_TYPE_EXPECTED",["allOf","array"]);else if(0===e.allOf.length)r.addError("KEYWORD_MUST_BE",["allOf","an array with at least one element"]);else for(var t=e.allOf.length;t--;)r.path.push("allOf"),r.path.push(t.toString()),exports.validateSchema.call(this,r,e.allOf[t]),r.path.pop(),r.path.pop()},anyOf:function(r,e){if(Array.isArray(e.anyOf)===!1)r.addError("KEYWORD_TYPE_EXPECTED",["anyOf","array"]);else if(0===e.anyOf.length)r.addError("KEYWORD_MUST_BE",["anyOf","an array with at least one element"]);else for(var t=e.anyOf.length;t--;)r.path.push("anyOf"),r.path.push(t.toString()),exports.validateSchema.call(this,r,e.anyOf[t]),r.path.pop(),r.path.pop()},oneOf:function(r,e){if(Array.isArray(e.oneOf)===!1)r.addError("KEYWORD_TYPE_EXPECTED",["oneOf","array"]);else if(0===e.oneOf.length)r.addError("KEYWORD_MUST_BE",["oneOf","an array with at least one element"]);else for(var t=e.oneOf.length;t--;)r.path.push("oneOf"),r.path.push(t.toString()),exports.validateSchema.call(this,r,e.oneOf[t]),r.path.pop(),r.path.pop()},not:function(r,e){"object"!==Utils.whatIs(e.not)?r.addError("KEYWORD_TYPE_EXPECTED",["not","object"]):(r.path.push("not"),exports.validateSchema.call(this,r,e.not),r.path.pop())},definitions:function(r,e){if("object"!==Utils.whatIs(e.definitions))r.addError("KEYWORD_TYPE_EXPECTED",["definitions","object"]);else for(var t=Object.keys(e.definitions),a=t.length;a--;){var i=t[a],o=e.definitions[i];r.path.push("definitions"),r.path.push(i),exports.validateSchema.call(this,r,o),r.path.pop(),r.path.pop()}},format:function(r,e){"string"!=typeof e.format?r.addError("KEYWORD_TYPE_EXPECTED",["format","string"]):void 0===FormatValidators[e.format]&&r.addError("UNKNOWN_FORMAT",[e.format])},id:function(r,e){"string"!=typeof e.id&&r.addError("KEYWORD_TYPE_EXPECTED",["id","string"])},title:function(r,e){"string"!=typeof e.title&&r.addError("KEYWORD_TYPE_EXPECTED",["title","string"])},description:function(r,e){"string"!=typeof e.description&&r.addError("KEYWORD_TYPE_EXPECTED",["description","string"])},"default":function(){}},validateArrayOfSchemas=function(r,e){for(var t=e.length;t--;)exports.validateSchema.call(this,r,e[t]);return r.isValid()};exports.validateSchema=function(r,e){if(Array.isArray(e))return validateArrayOfSchemas.call(this,r,e);if(e.__$validated)return!0;var t=e.$schema&&e.id!==e.$schema;if(t)if(e.__$schemaResolved&&e.__$schemaResolved!==e){var a=new Report(r),i=JsonValidation.validate.call(this,a,e.__$schemaResolved,e);i===!1&&r.addError("PARENT_SCHEMA_VALIDATION_FAILED",null,a)}else this.options.ignoreUnresolvableReferences!==!0&&r.addError("REF_UNRESOLVED",[e.$schema]);if(this.options.noTypeless===!0){if(void 0!==e.type){var o=[];Array.isArray(e.anyOf)&&(o=o.concat(e.anyOf)),Array.isArray(e.oneOf)&&(o=o.concat(e.oneOf)),Array.isArray(e.allOf)&&(o=o.concat(e.allOf)),o.forEach(function(r){r.type||(r.type=e.type)})}void 0===e.type&&void 0===e.anyOf&&void 0===e.oneOf&&void 0===e.not&&void 0===e.$ref&&r.addError("KEYWORD_UNDEFINED_STRICT",["type"])}for(var n=Object.keys(e),E=n.length;E--;){var s=n[E];0!==s.indexOf("__")&&(void 0!==SchemaValidators[s]?SchemaValidators[s].call(this,r,e):t||this.options.noExtraKeywords===!0&&r.addError("KEYWORD_UNEXPECTED",[s]))}var d=r.isValid();return d&&(e.__$validated=!0),d};
},{"./FormatValidators":20,"./JsonValidation":21,"./Report":23,"./Utils":27}],27:[function(require,module,exports){
"use strict";exports.whatIs=function(r){var e=typeof r;return"object"===e?null===r?"null":Array.isArray(r)?"array":"object":"number"===e?Number.isFinite(r)?r%1===0?"integer":"number":Number.isNaN(r)?"not-a-number":"unknown-number":e},exports.areEqual=function r(e,t){if(e===t)return!0;var n,u;if(Array.isArray(e)&&Array.isArray(t)){if(e.length!==t.length)return!1;for(u=e.length,n=0;u>n;n++)if(!r(e[n],t[n]))return!1;return!0}if("object"===exports.whatIs(e)&&"object"===exports.whatIs(t)){var o=Object.keys(e),i=Object.keys(t);if(!r(o,i))return!1;for(u=o.length,n=0;u>n;n++)if(!r(e[o[n]],t[o[n]]))return!1;return!0}return!1},exports.isUniqueArray=function(r,e){var t,n,u=r.length;for(t=0;u>t;t++)for(n=t+1;u>n;n++)if(exports.areEqual(r[t],r[n]))return e&&e.push(t,n),!1;return!0},exports.difference=function(r,e){for(var t=[],n=r.length;n--;)-1===e.indexOf(r[n])&&t.push(r[n]);return t},exports.clone=function(r){if("object"!=typeof r||null===r)return r;var e,t;if(Array.isArray(r))for(e=[],t=r.length;t--;)e[t]=r[t];else{e={};var n=Object.keys(r);for(t=n.length;t--;){var u=n[t];e[u]=r[u]}}return e};
},{}],28:[function(require,module,exports){
"use strict";function ZSchema(e){if(this.cache={},"object"==typeof e){for(var t=Object.keys(e),o=t.length;o--;){var i=t[o];if(void 0===defaultOptions[i])throw new Error("Unexpected option passed to constructor: "+i)}this.options=e}else this.options=Utils.clone(defaultOptions);this.options.strictMode===!0&&(this.options.forceAdditional=!0,this.options.forceItems=!0,this.options.forceMaxLength=!0,this.options.forceProperties=!0,this.options.noExtraKeywords=!0,this.options.noTypeless=!0,this.options.noEmptyStrings=!0,this.options.noEmptyArrays=!0)}require("./Polyfills");var Report=require("./Report"),FormatValidators=require("./FormatValidators"),JsonValidation=require("./JsonValidation"),SchemaCache=require("./SchemaCache"),SchemaCompilation=require("./SchemaCompilation"),SchemaValidation=require("./SchemaValidation"),Utils=require("./Utils"),defaultOptions={asyncTimeout:2e3,forceAdditional:!1,assumeAdditional:!1,forceItems:!1,forceMaxLength:!1,forceProperties:!1,ignoreUnresolvableReferences:!1,noExtraKeywords:!1,noTypeless:!1,noEmptyStrings:!1,noEmptyArrays:!1,strictUris:!1,strictMode:!1,reportPathAsArray:!1,breakOnFirstError:!0};ZSchema.prototype.compileSchema=function(e){var t=new Report(this.options);return"string"==typeof e&&(e=SchemaCache.getSchemaByUri.call(this,t,e)),SchemaCompilation.compileSchema.call(this,t,e),this.lastReport=t,t.isValid()},ZSchema.prototype.validateSchema=function(e){var t=new Report(this.options);"string"==typeof e&&(e=SchemaCache.getSchemaByUri.call(this,t,e));var o=SchemaCompilation.compileSchema.call(this,t,e);return o&&SchemaValidation.validateSchema.call(this,t,e),this.lastReport=t,t.isValid()},ZSchema.prototype.validate=function(e,t,o){var i=new Report(this.options);"string"==typeof t&&(t=SchemaCache.getSchemaByUri.call(this,i,t));var r=SchemaCompilation.compileSchema.call(this,i,t);if(!r)return this.lastReport=i,!1;var a=SchemaValidation.validateSchema.call(this,i,t);if(!a)return this.lastReport=i,!1;if(JsonValidation.validate.call(this,i,t,e),o)return void i.processAsyncTasks(this.options.asyncTimeout,o);if(i.asyncTasks.length>0)throw new Error("This validation has async tasks and cannot be done in sync mode, please provide callback argument.");return this.lastReport=i,i.isValid()},ZSchema.prototype.getLastErrors=function(){return this.lastReport.errors.length>0?this.lastReport.errors:void 0},ZSchema.prototype.getMissingReferences=function(){for(var e=[],t=this.lastReport.errors.length;t--;){var o=this.lastReport.errors[t];if("UNRESOLVABLE_REFERENCE"===o.code){var i=o.params[0];-1===e.indexOf(i)&&e.push(i)}}return e},ZSchema.prototype.getMissingRemoteReferences=function(){for(var e=this.getMissingReferences(),t=[],o=e.length;o--;){var i=SchemaCache.getRemotePath(e[o]);i&&-1===t.indexOf(i)&&t.push(i)}return t},ZSchema.prototype.setRemoteReference=function(e,t){"string"==typeof t&&(t=JSON.parse(t)),SchemaCache.cacheSchemaByUri.call(this,e,t)},ZSchema.registerFormat=function(e,t){FormatValidators[e]=t},module.exports=ZSchema;
},{"./FormatValidators":20,"./JsonValidation":21,"./Polyfills":22,"./Report":23,"./SchemaCache":24,"./SchemaCompilation":25,"./SchemaValidation":26,"./Utils":27}],29:[function(require,module,exports){
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

},{}],30:[function(require,module,exports){
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


},{}],31:[function(require,module,exports){
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
},{}],32:[function(require,module,exports){
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

},{}],33:[function(require,module,exports){
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
},{}],34:[function(require,module,exports){
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


},{}],35:[function(require,module,exports){
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
},{}],36:[function(require,module,exports){
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

},{}],37:[function(require,module,exports){
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

},{}],38:[function(require,module,exports){
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

},{}],39:[function(require,module,exports){
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
},{}],40:[function(require,module,exports){
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

},{}],41:[function(require,module,exports){
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