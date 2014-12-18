!function(e){if("object"==typeof exports&&"undefined"!=typeof module)module.exports=e();else if("function"==typeof define&&define.amd)define([],e);else{var o;"undefined"!=typeof window?o=window:"undefined"!=typeof global?o=global:"undefined"!=typeof self&&(o=self),(o.SwaggerTools||(o.SwaggerTools={})).specs=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
(function(e){"use strict";var r="undefined"!=typeof window?window._:"undefined"!=typeof e?e._:null,n="undefined"!=typeof window?window.async:"undefined"!=typeof e?e.async:null,i=require("./helpers"),t="undefined"!=typeof window?window.JsonRefs:"undefined"!=typeof e?e.JsonRefs:null,o="undefined"!=typeof window?window.SparkMD5:"undefined"!=typeof e?e.SparkMD5:null,s=require("swagger-converter"),a="undefined"!=typeof window?window.traverse:"undefined"!=typeof e?e.traverse:null,c=require("./validators"),u={},d=function _(e,i,o){var s=r.reduce(t.findRefs(i),function(e,r,n){return t.isRemotePointer(n)&&e.push(r.split("#")[0]),e},[]),a=function(r,n){t.resolveRefs({$ref:r},function(r,i){return r?n(r):void _(e,i,function(e,r){n(e,r)})})};s.length>0?n.map(s,a,function(n,i){return n?o(n):(r.each(i,function(r,n){e.setRemoteReference(s[n],r)}),void o())}):o()},f=function(e,r,n,i){i.push({code:e,message:r,path:n})},p=function(e,n,o,s,a){var c,u,d,p,h,l=!0,g=i.getSwaggerVersion(e.resolved),m=r.isArray(n)?n:t.pathFromPointer(n),w=r.isArray(n)?t.pathToPointer(n):n,v=r.isArray(o)?o:t.pathFromPointer(o),b=r.isArray(o)?t.pathToPointer(o):o;return 0===m.length?(f("INVALID_REFERENCE","Not a valid JSON Reference",v,s.errors),!1):(u=e.definitions[w],h=m[0],c="securityDefinitions"===h?"SECURITY_DEFINITION":h.substring(0,h.length-1).toUpperCase(),d="1.2"===g?m[m.length-1]:w,p="securityDefinitions"===h?"Security definition":c.charAt(0)+c.substring(1).toLowerCase(),["authorizations","securityDefinitions"].indexOf(m[0])>-1&&"scopes"===m[2]&&(c+="_SCOPE",p+=" scope"),r.isUndefined(u)?(a||f("UNRESOLVABLE_"+c,p+" could not be resolved: "+d,v,s.errors),l=!1):(r.isUndefined(u.references)&&(u.references=[]),u.references.push(b)),l)},h=function C(e,n){var i,o,s="Composed "+("1.2"===e.swaggerVersion?t.pathFromPointer(n).pop():n),c=e.definitions[n],u=a(e.original),d=a(e.resolved);return c?(o=r.cloneDeep(u.get(t.pathFromPointer(n))),i=r.cloneDeep(d.get(t.pathFromPointer(n))),"1.2"===e.swaggerVersion&&(c.lineage.length>0&&(i.allOf=[],r.each(c.lineage,function(r){i.allOf.push(C(e,r))})),delete i.subTypes,r.each(i.properties,function(n,i){var s=o.properties[i];r.each(["maximum","minimum"],function(e){r.isString(n[e])&&(n[e]=parseFloat(n[e]))}),r.each(t.findRefs(s),function(r,i){var o="#/models/"+r,s=e.definitions[o],c=t.pathFromPointer(i);s.lineage.length>0?a(n).set(c.slice(0,c.length-1),C(e,o)):(a(n).set(c.slice(0,c.length-1).concat("title"),"Composed "+r),a(n).set(c.slice(0,c.length-1).concat("type"),"object"))})})),i=a(i).map(function(e){"id"===this.key&&r.isString(e)&&this.remove()}),i.title=s,i.type="object",i):void 0},l=function(e,r,n,i,t){f("UNUSED_"+r,n+" is defined but is not used: "+e,i,t)},g=function(e){var n=o.hash(JSON.stringify(e)),t=u[n]||r.find(u,function(e){return e.resolvedId===n});return t||(t=u[n]={definitions:{},original:e,resolved:void 0,swaggerVersion:i.getSwaggerVersion(e)}),t},m=function(e,r){var n=new Error("The Swagger document(s) are invalid");n.errors=e.errors,n.failedValidation=!0,n.warnings=e.warnings,e.apiDeclarations&&(n.apiDeclarations=e.apiDeclarations),r(n)},w=function(e){var n=e.match(/\{(.*?)\}/g),i=[],t=e;return n&&r.each(n,function(e,r){t=t.replace(e,"{"+r+"}"),i.push(e.replace(/[{}]/g,""))}),{path:t,args:i}},v=function(e,n,i,t,o,s){!r.isUndefined(e)&&e.indexOf(n)>-1&&f("DUPLICATE_"+i,t+" already defined: "+n,o,s)},b=function(e,r,n,i,t){try{c.validateSchemaConstraints(e.swaggerVersion,r,n,void 0)}catch(o){t||f(o.code,o.message,o.path,i.errors)}},E=function(e,n){var i=e.swaggerVersion,o=function(r){var n=t.pathToPointer(r),i=e.definitions[n];return i||(i=e.definitions[n]={references:[]},["definitions","models"].indexOf(t.pathFromPointer(n)[0])>-1&&(i.cyclical=!1,i.lineage=void 0,i.parents=[])),i},s=function(e){return"1.2"===i?t.pathFromPointer(e).pop():e},c=function h(n,i,t){var o=e.definitions[i||n];o&&r.each(o.parents,function(e){t.push(e),n!==e&&h(n,e,t)})},u="1.2"===i?"authorizations":"securityDefinitions",d="1.2"===i?"models":"definitions";switch(r.each(e.resolved[u],function(e,t){var s=[u,t];("1.2"!==i||e.type)&&(o(s),r.reduce(e.scopes,function(e,r,t){var a="1.2"===i?r.scope:t,c=s.concat(["scopes",t.toString()]),u=o(s.concat(["scopes",a]));return u.scopePath=c,v(e,a,"AUTHORIZATION_SCOPE_DEFINITION","Authorization scope definition","1.2"===i?c.concat("scope"):c,n.warnings),e.push(a),e},[]))}),r.each(e.resolved[d],function(s,a){var c=[d,a],u=o(c);if("1.2"===i&&a!==s.id&&f("MODEL_ID_MISMATCH","Model id does not match id in models object: "+s.id,c.concat("id"),n.errors),r.isUndefined(u.lineage))switch(i){case"1.2":r.each(s.subTypes,function(r,i){var s=["models",r],a=t.pathToPointer(s),u=e.definitions[a],f=c.concat(["subTypes",i.toString()]);!u&&e.resolved[d][r]&&(u=o(s)),p(e,s,f,n)&&u.parents.push(t.pathToPointer(c))});break;default:r.each(e.original[d][a].allOf,function(i,s){var a,d,f=c.concat(["allOf",s.toString()]);r.isUndefined(i.$ref)||t.isRemotePointer(i.$ref)?d=c.concat(["allOf",s.toString()]):(a=o(t.pathFromPointer(i.$ref)),d=t.pathFromPointer(i.$ref)),u.parents.push(t.pathToPointer(d)),a&&p(e,d,f,n)})}}),i){case"2.0":r.each(e.resolved.parameters,function(r,i){var t=["parameters",i];o(t),b(e,r,t,n)}),r.each(e.resolved.responses,function(r,i){var t=["responses",i];o(t),b(e,r,t,n)})}r.each(e.definitions,function(o,u){var d,p,h,l=t.pathFromPointer(u),g=a(e.original).get(l),m=l[0],w=m.substring(0,m.length-1).toUpperCase(),v=w.charAt(0)+w.substring(1).toLowerCase();-1!==["definitions","models"].indexOf(m)&&(d=[],p=[],h=o.lineage,r.isUndefined(h)&&(h=[],c(u,void 0,h),h.reverse(),o.lineage=r.cloneDeep(h),o.cyclical=h.length>1&&h[0]===u),o.parents.length>1&&"1.2"===i&&f("MULTIPLE_"+w+"_INHERITANCE","Child "+w.toLowerCase()+" is sub type of multiple models: "+r.map(o.parents,function(e){return s(e)}).join(" && "),l,n.errors),o.cyclical&&f("CYCLICAL_"+w+"_INHERITANCE",v+" has a circular inheritance: "+r.map(h,function(e){return s(e)}).join(" -> ")+" -> "+s(u),l.concat("1.2"===i?"subTypes":"allOf"),n.errors),r.each(h.slice(o.cyclical?1:0),function(n){var i=a(e.resolved).get(t.pathFromPointer(n));r.each(Object.keys(i.properties),function(e){-1===p.indexOf(e)&&p.push(e)})}),b(e,g,l,n),r.each(g.properties,function(i,t){var o=l.concat(["properties",t]);r.isUndefined(i)||(b(e,i,o,n),p.indexOf(t)>-1?f("CHILD_"+w+"_REDECLARES_PROPERTY","Child "+w.toLowerCase()+" declares property already declared by ancestor: "+t,o,n.errors):d.push(t))}),r.each(g.required||[],function(e,r){-1===p.indexOf(e)&&-1===d.indexOf(e)&&f("MISSING_REQUIRED_MODEL_PROPERTY","Model requires property but it is not defined: "+e,l.concat(["required",r.toString()]),n.errors)}))}),r.each(t.findRefs(e.original),function(r,i){"1.2"===e.swaggerVersion&&(r="#/models/"+r),t.isRemotePointer(r)||p(e,r,i,n)})},y=function(e,n,i,t,o,s){r.isUndefined(e)||-1!==e.indexOf(n)||f("UNRESOLVABLE_"+i,t+" could not be resolved: "+n,o,s)},j=function(e,n,i,t){var o="1.2"===e.swaggerVersion?"AUTHORIZATION":"SECURITY_DEFINITION",s="AUTHORIZATION"===o?"Authorization":"Security definition";"1.2"===e.swaggerVersion?r.reduce(n,function(n,a,c){var u="#/authorizations/"+c,d=i.concat([c]);return p(e,u,d,t)&&r.reduce(a,function(r,n,i){var a=d.concat(i.toString(),"scope"),c=u+"/scopes/"+n.scope;return v(r,n.scope,o+"_SCOPE_REFERENCE",s+" scope reference",a,t.warnings),p(e,c,a,t),r.concat(n.scope)},[]),n.concat(c)},[]):r.reduce(n,function(n,a,c){return r.each(a,function(a,u){var d="#/securityDefinitions/"+u,f=i.concat(c.toString(),u);v(n,u,o+"_REFERENCE",s+" reference",f,t.warnings),n.push(u),p(e,d,f,t)&&r.each(a,function(r,n){p(e,d+"/scopes/"+r,f.concat(n.toString()),t)})}),n},[])},O=function(e,n){var s,c=g(e),u=i.getSwaggerVersion(e);c.resolved?n():("1.2"===u&&(e=r.cloneDeep(e),s=a(e),r.each(t.findRefs(e),function(e,r){s.set(t.pathFromPointer(r),"#/models/"+e)})),t.resolveRefs(e,function(e,r){return e?n(e):(c.resolved=r,c.resolvedId=o.hash(JSON.stringify(r)),void n())}))},P=function(e,n,t,o){var s=r.isString(n)?e.validators[n]:i.createJsonValidator(),a=function(){try{c.validateAgainstSchema(n,t,s)}catch(e){return e.failedValidation?o(void 0,e.results):o(e)}O(t,function(e){return o(e)})};d(s,t,function(e){return e?o(e):void a()})},T=function(e,n){r.each(e.definitions,function(r,i){var o=t.pathFromPointer(i),s=o[0].substring(0,o[0].length-1),a="1.2"===e.swaggerVersion?o[o.length-1]:i,c="securityDefinition"===s?"SECURITY_DEFINITION":s.toUpperCase(),u="securityDefinition"===s?"Security definition":s.charAt(0).toUpperCase()+s.substring(1);0===r.references.length&&(r.scopePath&&(c+="_SCOPE",u+=" scope",o=r.scopePath),l(a,c,u,o,n.warnings))})},R=function(e,n,i,t,o,s,a){var c=[];r.reduce(t,function(e,t,a){var u=o.concat(["parameters",a.toString()]);if(!r.isUndefined(t))return v(e,t.name,"PARAMETER","Parameter",u.concat("name"),s.errors),("path"===t.paramType||"path"===t["in"])&&(-1===i.args.indexOf(t.name)&&f("UNRESOLVABLE_API_PATH_PARAMETER","API path parameter could not be resolved: "+t.name,u.concat("name"),s.errors),c.push(t.name)),b(n,t,u,s,t.skipErrors),e.concat(t.name)},[]),(r.isUndefined(a)||a===!1)&&r.each(r.difference(i.args,c),function(e){f("MISSING_API_PATH_PARAMETER","API requires path parameter but it is not defined: "+e,"1.2"===n.swaggerVersion?o.slice(0,2).concat("path"):o,s.errors)})},S=function(e,n,i,t){var o=[],s=g(n),a=[],c={errors:[],warnings:[],apiDeclarations:[]};a=r.reduce(n.apis,function(e,r,n){return v(e,r.path,"RESOURCE_PATH","Resource path",["apis",n.toString(),"path"],c.errors),e.push(r.path),e},[]),E(s,c),o=r.reduce(i,function(n,i,t){var u=c.apiDeclarations[t]={errors:[],warnings:[]},d=g(i);return v(n,i.resourcePath,"RESOURCE_PATH","Resource path",["resourcePath"],u.errors),-1===o.indexOf(i.resourcePath)&&(y(a,i.resourcePath,"RESOURCE_PATH","Resource path",["resourcePath"],u.errors),n.push(i.resourcePath)),E(d,u),r.reduce(i.apis,function(n,i,t){var o=["apis",t.toString()],a=w(i.path);return n.indexOf(a.path)>-1?f("DUPLICATE_API_PATH","API path (or equivalent) already defined: "+i.path,o.concat("path"),u.errors):n.push(a.path),r.reduce(i.operations,function(n,i,t){var c=o.concat(["operations",t.toString()]);return v(n,i.method,"OPERATION_METHOD","Operation method",c.concat("method"),u.errors),n.push(i.method),-1===e.primitives.indexOf(i.type)&&"1.2"===e.version&&p(d,"#/models/"+i.type,c.concat("type"),u),j(s,i.authorizations,c.concat("authorizations"),u),b(d,i,c,u),R(e,d,a,i.parameters,c,u),r.reduce(i.responseMessages,function(e,r,n){var i=c.concat(["responseMessages",n.toString()]);return v(e,r.code,"RESPONSE_MESSAGE_CODE","Response message code",i.concat(["code"]),u.errors),r.responseModel&&p(d,"#/models/"+r.responseModel,i.concat("responseModel"),u),e.concat(r.code)},[]),n},[]),n},[]),T(d,u),n},[]),T(s,c),r.each(r.difference(a,o),function(e){var r=a.indexOf(e);l(n.apis[r].path,"RESOURCE_PATH","Resource path",["apis",r.toString(),"path"],c.errors)}),t(void 0,c)},U=function(e,n,i){var t=g(n),o={errors:[],warnings:[]};E(t,o),j(t,n.security,["security"],o),r.reduce(t.resolved.paths,function(n,i,s){var a=["paths",s],c=w(s);return n.indexOf(c.path)>-1&&f("DUPLICATE_API_PATH","API path (or equivalent) already defined: "+s,a,o.errors),R(e,t,c,i.parameters,a,o,!0),r.each(i,function(n,s){var u=[],d=a.concat(s),f=[];"parameters"!==s&&(j(t,n.security,d.concat("security"),o),r.each(n.parameters,function(e){u.push(e),f.push(e.name+":"+e["in"])}),r.each(i.parameters,function(e){var n=r.cloneDeep(e);n.skipErrors=!0,-1===f.indexOf(e.name+":"+e["in"])&&u.push(n)}),R(e,t,c,u,d,o),r.each(n.responses,function(e,r){b(t,e,d.concat("responses",r),o)}))}),n.concat(c.path)},[]),T(t,o),i(void 0,o)},A=function(e,r,n,t){var o=function(e,r){t(e,i.formatResults(r))};"1.2"===e.version?S(e,r,n,o):U(e,r,o)},D=function(e,i,t,o){P(e,"1.2"===e.version?"resourceListing.json":"schema.json",i,function(i,s){return i?o(i):void(s||"1.2"!==e.version?o(void 0,s):(s={errors:[],warnings:[],apiDeclarations:[]},n.map(t,function(r,n){P(e,"apiDeclaration.json",r,n)},function(e,n){return e?o(e):(r.each(n,function(e,r){s.apiDeclarations[r]=e}),void o(void 0,s))})))})},I=function(e){var n=function(e,n){return r.reduce(n,function(e,r,n){return e[n]=i.createJsonValidator(r),e}.bind(this),{})},t=function(e){var n=r.cloneDeep(this.schemas[e]);return n.id=e,n}.bind(this),o=["string","number","boolean","integer","array"];switch(e){case"1.2":this.docsUrl="https://github.com/swagger-api/swagger-spec/blob/master/versions/1.2.md",this.primitives=r.union(o,["void","File"]),this.schemasUrl="https://github.com/swagger-api/swagger-spec/tree/master/schemas/v1.2",this.schemas={"apiDeclaration.json":require("../schemas/1.2/apiDeclaration.json"),"authorizationObject.json":require("../schemas/1.2/authorizationObject.json"),"dataType.json":require("../schemas/1.2/dataType.json"),"dataTypeBase.json":require("../schemas/1.2/dataTypeBase.json"),"infoObject.json":require("../schemas/1.2/infoObject.json"),"modelsObject.json":require("../schemas/1.2/modelsObject.json"),"oauth2GrantType.json":require("../schemas/1.2/oauth2GrantType.json"),"operationObject.json":require("../schemas/1.2/operationObject.json"),"parameterObject.json":require("../schemas/1.2/parameterObject.json"),"resourceListing.json":require("../schemas/1.2/resourceListing.json"),"resourceObject.json":require("../schemas/1.2/resourceObject.json")},this.validators=n(this,{"apiDeclaration.json":r.map(["dataTypeBase.json","modelsObject.json","oauth2GrantType.json","authorizationObject.json","parameterObject.json","operationObject.json","apiDeclaration.json"],t),"resourceListing.json":r.map(["resourceObject.json","infoObject.json","oauth2GrantType.json","authorizationObject.json","resourceListing.json"],t)});break;case"2.0":this.docsUrl="https://github.com/swagger-api/swagger-spec/blob/master/versions/2.0.md",this.primitives=r.union(o,["file"]),this.schemasUrl="https://github.com/swagger-api/swagger-spec/tree/master/schemas/v2.0",this.schemas={"schema.json":require("../schemas/2.0/schema.json")},this.validators=n(this,{"schema.json":[t("schema.json")]});break;default:throw new Error(e+" is an unsupported Swagger specification version")}this.version=e};I.prototype.validate=function(e,n,t){switch(this.version){case"1.2":if(r.isUndefined(e))throw new Error("resourceListing is required");if(!r.isPlainObject(e))throw new TypeError("resourceListing must be an object");if(r.isUndefined(n))throw new Error("apiDeclarations is required");if(!r.isArray(n))throw new TypeError("apiDeclarations must be an array");break;case"2.0":if(r.isUndefined(e))throw new Error("swaggerObject is required");if(!r.isPlainObject(e))throw new TypeError("swaggerObject must be an object")}if("2.0"===this.version&&(t=arguments[1]),r.isUndefined(t))throw new Error("callback is required");if(!r.isFunction(t))throw new TypeError("callback must be a function");"2.0"===this.version&&(n=[]),D(this,e,n,function(r,o){r||i.formatResults(o)?t(r,o):A(this,e,n,t)}.bind(this))},I.prototype.composeModel=function(e,n,t){var o=i.getSwaggerVersion(e),s=function(r,o){var s;return r?t(r):i.getErrorCount(o)>0?m(o,t):(s=g(e),o={errors:[],warnings:[]},E(s,o),s.definitions[n]?i.getErrorCount(o)>0?m(o,t):void t(void 0,h(s,n)):t())};switch(this.version){case"1.2":if(r.isUndefined(e))throw new Error("apiDeclaration is required");if(!r.isPlainObject(e))throw new TypeError("apiDeclaration must be an object");if(r.isUndefined(n))throw new Error("modelId is required");break;case"2.0":if(r.isUndefined(e))throw new Error("swaggerObject is required");if(!r.isPlainObject(e))throw new TypeError("swaggerObject must be an object");if(r.isUndefined(n))throw new Error("modelRef is required")}if(r.isUndefined(t))throw new Error("callback is required");if(!r.isFunction(t))throw new TypeError("callback must be a function");if("#"!==n.charAt(0)){if("1.2"!==this.version)throw new Error("modelRef must be a JSON Pointer");n="#/models/"+n}"1.2"===o?P(this,"apiDeclaration.json",e,s):this.validate(e,s)},I.prototype.validateModel=function(e,n,i,t){switch(this.version){case"1.2":if(r.isUndefined(e))throw new Error("apiDeclaration is required");if(!r.isPlainObject(e))throw new TypeError("apiDeclaration must be an object");if(r.isUndefined(n))throw new Error("modelId is required");break;case"2.0":if(r.isUndefined(e))throw new Error("swaggerObject is required");if(!r.isPlainObject(e))throw new TypeError("swaggerObject must be an object");if(r.isUndefined(n))throw new Error("modelRef is required")}if(r.isUndefined(i))throw new Error("data is required");if(r.isUndefined(t))throw new Error("callback is required");if(!r.isFunction(t))throw new TypeError("callback must be a function");this.composeModel(e,n,function(e,r){return e?t(e):void P(this,r,i,t)}.bind(this))},I.prototype.resolve=function(e,n,o){var s,c,u=function(e){return r.isString(n)?o(void 0,a(e).get(t.pathFromPointer(n))):o(void 0,e)};if(r.isUndefined(e))throw new Error("document is required");if(!r.isPlainObject(e))throw new TypeError("document must be an object");if(2===arguments.length&&(o=arguments[1],n=void 0),!r.isUndefined(n)&&!r.isString(n))throw new TypeError("ptr must be a JSON Pointer string");if(r.isUndefined(o))throw new Error("callback is required");if(!r.isFunction(o))throw new TypeError("callback must be a function");if(s=g(e),"1.2"===s.swaggerVersion)throw new Error("Swagger 1.2 is not supported");return s.resolved?u(s.resolved):(c="1.2"===s.swaggerVersion?r.find(["basePath","consumes","models","produces","resourcePath"],function(n){return!r.isUndefined(e[n])})?"apiDeclaration.json":"resourceListing.json":"schema.json",void this.validate(e,function(e,r){return e?o(e):i.getErrorCount(r)>0?m(r,o):u(s.resolved)}))},I.prototype.convert=function(e,n,t,o){var a=function(e,r){o(void 0,s(e,r))}.bind(this);if("1.2"!==this.version)throw new Error("Specification#convert only works for Swagger 1.2");if(r.isUndefined(e))throw new Error("resourceListing is required");if(!r.isPlainObject(e))throw new TypeError("resourceListing must be an object");if(r.isUndefined(n)&&(n=[]),!r.isArray(n))throw new TypeError("apiDeclarations must be an array");if(arguments.length<4&&(o=arguments[arguments.length-1]),r.isUndefined(o))throw new Error("callback is required");if(!r.isFunction(o))throw new TypeError("callback must be a function");t===!0?a(e,n):this.validate(e,n,function(r,t){return r?o(r):i.getErrorCount(t)>0?m(t,o):void a(e,n)})},module.exports.v1=module.exports.v1_2=new I("1.2"),module.exports.v2=module.exports.v2_0=new I("2.0")}).call(this,"undefined"!=typeof global?global:"undefined"!=typeof self?self:"undefined"!=typeof window?window:{});
},{"../schemas/1.2/apiDeclaration.json":11,"../schemas/1.2/authorizationObject.json":12,"../schemas/1.2/dataType.json":13,"../schemas/1.2/dataTypeBase.json":14,"../schemas/1.2/infoObject.json":15,"../schemas/1.2/modelsObject.json":16,"../schemas/1.2/oauth2GrantType.json":17,"../schemas/1.2/operationObject.json":18,"../schemas/1.2/parameterObject.json":19,"../schemas/1.2/resourceListing.json":20,"../schemas/1.2/resourceObject.json":21,"../schemas/2.0/schema.json":22,"./helpers":2,"./validators":3,"swagger-converter":10}],2:[function(require,module,exports){
(function(e,r){"use strict";var n="undefined"!=typeof window?window._:"undefined"!=typeof r?r._:null,o="undefined"!=typeof window?window.JsonRefs:"undefined"!=typeof r?r.JsonRefs:null,t="undefined"!=typeof window?window.ZSchema:"undefined"!=typeof r?r.ZSchema:null,i=require("../schemas/json-schema-draft-04.json"),a="http://json-schema.org/draft-04/schema",s={};module.exports.createJsonValidator=function(e){var r,s=new t({reportPathAsArray:!0});if(s.setRemoteReference(a,i),n.each(["byte","double","float","int32","int64","mime-type","uri-template"],function(e){t.registerFormat(e,function(){return!0})}),!n.isUndefined(e)&&(r=s.compileSchema(e),r===!1))throw console.error("JSON Schema file"+(e.length>1?"s are":" is")+" invalid:"),n.each(s.getLastErrors(),function(e){console.error("  "+(n.isArray(e.path)?o.pathToPointer(e.path):e.path)+": "+e.message)}),new Error("Unable to create validator due to invalid JSON Schema");return s},module.exports.formatResults=function(e){return e?e.errors.length+e.warnings.length+n.reduce(e.apiDeclarations,function(e,r){return r&&(e+=r.errors.length+r.warnings.length),e},0)>0?e:void 0:e},module.exports.getErrorCount=function(e){var r=0;return e&&(r=e.errors.length,n.each(e.apiDeclarations,function(e){e&&(r+=e.errors.length)})),r},module.exports.getSpec=function(e){var r=s[e];if(n.isUndefined(r))switch(e){case"1.2":r=require("../lib/specs").v1_2;break;case"2.0":r=require("../lib/specs").v2_0}return r},module.exports.getSwaggerVersion=function(e){return n.isPlainObject(e)?e.swaggerVersion||e.swagger:void 0};var l=module.exports.toJsonPointer=function(e){return"#/"+e.map(function(e){return e.replace(/~/g,"~0").replace(/\//g,"~1")}).join("/")};module.exports.printValidationResults=function(r,o,t,i,a,s){var c=function(e,r){return 1===r?e:e+"s"},u=function g(e,r,o){e&&(console.error(e+":"),console.error()),n.each(r,function(e){console.error(new Array(o+1).join(" ")+l(e.path)+": "+e.message),e.inner&&g(void 0,e.inner,o+2)}),e&&console.error()},d=0,f=0;console.error(),i.errors.length>0&&(d+=i.errors.length,u("API Errors",i.errors,2)),i.warnings.length>0&&(f+=i.warnings.length,u("API Warnings",i.warnings,2)),i.apiDeclarations&&i.apiDeclarations.forEach(function(e,r){if(e){var n=t[r].resourcePath||r;e.errors.length>0&&(d+=e.errors.length,u("  API Declaration ("+n+") Errors",e.errors,4)),e.warnings.length>0&&(f+=e.warnings.length,u("  API Declaration ("+n+") Warnings",e.warnings,4))}}),a&&console.error(d>0?d+" "+c("error",d)+" and "+f+" "+c("warning",f):"Validation succeeded but with "+f+" "+c("warning",f)),d>0&&s&&e.exit(1)}}).call(this,require("_process"),"undefined"!=typeof global?global:"undefined"!=typeof self?self:"undefined"!=typeof window?window:{});
},{"../lib/specs":undefined,"../schemas/json-schema-draft-04.json":23,"_process":4}],3:[function(require,module,exports){
(function(e){"use strict";var t="undefined"!=typeof window?window._:"undefined"!=typeof e?e._:null,n=require("./helpers"),i=/^([0-9]{4})-([0-9]{2})-([0-9]{2})$/,a=/^([0-9]{2}):([0-9]{2}):([0-9]{2})(.[0-9]+)?(z|([+-][0-9]{2}:[0-9]{2}))$/,o=function(e){var n,a,o;return t.isString(e)||(e=e.toString()),a=i.exec(e),null===a?!1:(n=a[3],o=a[2],"01">o||o>"12"||"01">n||n>"31"?!1:!0)},r=function(e){var n,i,r,s,d,l,u;return t.isString(e)||(e=e.toString()),l=e.toLowerCase().split("t"),i=l[0],r=l.length>1?l[1]:void 0,o(i)?(s=a.exec(r),null===s?!1:(n=s[1],d=s[2],u=s[3],n>"23"||d>"59"||u>"59"?!1:!0)):!1},s=function(e,t){var n=new Error(t);throw n.code=e,n.failedValidation=!0,n};module.exports.validateAgainstSchema=function(e,i,a){var o=function(e){delete e.params,e.inner&&t.each(e.inner,function(e){o(e)})},r=t.isPlainObject(e)?t.cloneDeep(e):e;t.isUndefined(a)&&(a=n.createJsonValidator([r]));var d=a.validate(i,r);if(!d)try{s("SCHEMA_VALIDATION_FAILED","Failed schema validation")}catch(l){throw l.results={errors:t.map(a.getLastErrors(),function(e){return o(e),e}),warnings:[]},l}};var d=module.exports.validateArrayType=function(e){"array"===e.type&&t.isUndefined(e.items)&&s("OBJECT_MISSING_REQUIRED_PROPERTY","Missing required property: items")};module.exports.validateContentType=function(e,n,i){var a="function"==typeof i.end,o=a?i.getHeader("content-type"):i.headers["content-type"],r=t.union(e,n);if(o||(o=a?"text/plain":"application/octet-stream"),o=o.split(";")[0],r.length>0&&(a?!0:-1!==["POST","PUT"].indexOf(i.method))&&-1===r.indexOf(o))throw new Error("Invalid content type ("+o+").  These are valid: "+r.join(", "))};var l=module.exports.validateEnum=function(e,n){t.isUndefined(n)||t.isUndefined(e)||-1!==n.indexOf(e)||s("ENUM_MISMATCH","Not an allowable value ("+n.join(", ")+"): "+e)},u=module.exports.validateMaximum=function(e,n,i,a){var o,r,d=a===!0?"MAXIMUM_EXCLUSIVE":"MAXIMUM";t.isUndefined(a)&&(a=!1),"integer"===i?r=parseInt(e,10):"number"===i&&(r=parseFloat(e)),t.isUndefined(n)||(o=parseFloat(n),a&&r>=o?s(d,"Greater than or equal to the configured maximum ("+n+"): "+e):r>o&&s(d,"Greater than the configured maximum ("+n+"): "+e))},m=module.exports.validateMaxItems=function(e,n){!t.isUndefined(n)&&e.length>n&&s("ARRAY_LENGTH_LONG","Array is too long ("+e.length+"), maximum "+n)},f=module.exports.validateMaxLength=function(e,n){!t.isUndefined(n)&&e.length>n&&s("MAX_LENGTH","String is too long ("+e.length+" chars), maximum "+n)},c=module.exports.validateMaxProperties=function(e,n){var i=t.isPlainObject(e)?Object.keys(e).length:0;!t.isUndefined(n)&&i>n&&s("MAX_PROPERTIES","Number of properties is too many ("+i+" properties), maximum "+n)},p=module.exports.validateMinimum=function(e,n,i,a){var o,r,d=a===!0?"MINIMUM_EXCLUSIVE":"MINIMUM";t.isUndefined(a)&&(a=!1),"integer"===i?r=parseInt(e,10):"number"===i&&(r=parseFloat(e)),t.isUndefined(n)||(o=parseFloat(n),a&&o>=r?s(d,"Less than or equal to the configured minimum ("+n+"): "+e):o>r&&s(d,"Less than the configured minimum ("+n+"): "+e))},h=module.exports.validateMinItems=function(e,n){!t.isUndefined(n)&&e.length<n&&s("ARRAY_LENGTH_SHORT","Array is too short ("+e.length+"), minimum "+n)},v=module.exports.validateMinLength=function(e,n){!t.isUndefined(n)&&e.length<n&&s("MIN_LENGTH","String is too short ("+e.length+" chars), minimum "+n)},x=module.exports.validateMinProperties=function(e,n){var i=t.isPlainObject(e)?Object.keys(e).length:0;!t.isUndefined(n)&&n>i&&s("MIN_PROPERTIES","Number of properties is too few ("+i+" properties), minimum "+n)},g=module.exports.validateMultipleOf=function(e,n){t.isUndefined(n)||e%n===0||s("MULTIPLE_OF","Not a multiple of "+n)},U=module.exports.validatePattern=function(e,n){!t.isUndefined(n)&&t.isNull(e.match(new RegExp(n)))&&s("PATTERN","Does not match required pattern: "+n)};module.exports.validateRequiredness=function(e,n){!t.isUndefined(n)&&n===!0&&t.isUndefined(e)&&s("REQUIRED","Is required")};var I=module.exports.validateTypeAndFormat=function y(e,n,i,a){var d=!0;if(t.isArray(e))t.each(e,function(e,t){y(e,n,i,!0)||s("INVALID_TYPE","Value at index "+t+" is not a valid "+n+": "+e)});else switch(n){case"boolean":d=t.isBoolean(e)||-1!==["false","true"].indexOf(e);break;case"integer":d=!t.isNaN(parseInt(e,10));break;case"number":d=!t.isNaN(parseFloat(e));break;case"string":if(!t.isUndefined(i))switch(i){case"date":d=o(e);break;case"date-time":d=r(e)}break;case"void":d=t.isUndefined(e)}return a?d:void(d||s("INVALID_TYPE","void"!==n?"Not a valid "+(t.isUndefined(i)?"":i+" ")+n+": "+e:"Void does not allow a value"))},M=module.exports.validateUniqueItems=function(e,n){t.isUndefined(n)||t.uniq(e).length===e.length||s("ARRAY_UNIQUE","Does not allow duplicate values: "+e.join(", "))};module.exports.validateSchemaConstraints=function(e,n,i,a){var o=function y(e){var t=e;return t.schema&&(i=i.concat(["schema"]),t=y(t.schema)),t},r=n.type;r||(n.schema?(n=o(n),r=n.type||"object"):r="void");try{if("array"===r&&d(n),t.isUndefined(a)&&(a="1.2"===e?n.defaultValue:n["default"],i=i.concat(["1.2"===e?"defaultValue":"default"])),t.isUndefined(a))return;"array"===r?t.isUndefined(n.items)?I(a,r,n.format):I(a,"array"===r?n.items.type:r,"array"===r&&n.items.format?n.items.format:n.format):I(a,r,n.format),l(a,n["enum"]),u(a,n.maximum,r,n.exclusiveMaximum),m(a,n.maxItems),f(a,n.maxLength),c(a,n.maxProperties),p(a,n.minimum,r,n.exclusiveMinimum),h(a,n.minItems),v(a,n.minLength),x(a,n.minProperties),g(a,n.multipleOf),U(a,n.pattern),M(a,n.uniqueItems)}catch(s){throw s.path=i,s}}}).call(this,"undefined"!=typeof global?global:"undefined"!=typeof self?self:"undefined"!=typeof window?window:{});
},{"./helpers":2}],4:[function(require,module,exports){
function noop(){}var process=module.exports={};process.nextTick=function(){var o="undefined"!=typeof window&&window.setImmediate,e="undefined"!=typeof window&&window.postMessage&&window.addEventListener;if(o)return function(o){return window.setImmediate(o)};if(e){var s=[];return window.addEventListener("message",function(o){var e=o.source;if((e===window||null===e)&&"process-tick"===o.data&&(o.stopPropagation(),s.length>0)){var n=s.shift();n()}},!0),function(o){s.push(o),window.postMessage("process-tick","*")}}return function(o){setTimeout(o,0)}}(),process.title="browser",process.browser=!0,process.env={},process.argv=[],process.on=noop,process.addListener=noop,process.once=noop,process.off=noop,process.removeListener=noop,process.removeAllListeners=noop,process.emit=noop,process.binding=function(){throw new Error("process.binding is not supported")},process.cwd=function(){return"/"},process.chdir=function(){throw new Error("process.chdir is not supported")};
},{}],5:[function(require,module,exports){
(function(e){!function(o){function n(e){throw RangeError(M[e])}function t(e,o){for(var n=e.length;n--;)e[n]=o(e[n]);return e}function r(e,o){return t(e.split(L),o).join(".")}function f(e){for(var o,n,t=[],r=0,f=e.length;f>r;)o=e.charCodeAt(r++),o>=55296&&56319>=o&&f>r?(n=e.charCodeAt(r++),56320==(64512&n)?t.push(((1023&o)<<10)+(1023&n)+65536):(t.push(o),r--)):t.push(o);return t}function i(e){return t(e,function(e){var o="";return e>65535&&(e-=65536,o+=T(e>>>10&1023|55296),e=56320|1023&e),o+=T(e)}).join("")}function u(e){return 10>e-48?e-22:26>e-65?e-65:26>e-97?e-97:x}function c(e,o){return e+22+75*(26>e)-((0!=o)<<5)}function d(e,o,n){var t=0;for(e=n?R(e/A):e>>1,e+=R(e/o);e>P*j>>1;t+=x)e=R(e/P);return R(t+(P+1)*e/(e+m))}function l(e){var o,t,r,f,c,l,s,a,p,h,v=[],w=e.length,g=0,y=F,m=I;for(t=e.lastIndexOf(E),0>t&&(t=0),r=0;t>r;++r)e.charCodeAt(r)>=128&&n("not-basic"),v.push(e.charCodeAt(r));for(f=t>0?t+1:0;w>f;){for(c=g,l=1,s=x;f>=w&&n("invalid-input"),a=u(e.charCodeAt(f++)),(a>=x||a>R((b-g)/l))&&n("overflow"),g+=a*l,p=m>=s?C:s>=m+j?j:s-m,!(p>a);s+=x)h=x-p,l>R(b/h)&&n("overflow"),l*=h;o=v.length+1,m=d(g-c,o,0==c),R(g/o)>b-y&&n("overflow"),y+=R(g/o),g%=o,v.splice(g++,0,y)}return i(v)}function s(e){var o,t,r,i,u,l,s,a,p,h,v,w,g,y,m,A=[];for(e=f(e),w=e.length,o=F,t=0,u=I,l=0;w>l;++l)v=e[l],128>v&&A.push(T(v));for(r=i=A.length,i&&A.push(E);w>r;){for(s=b,l=0;w>l;++l)v=e[l],v>=o&&s>v&&(s=v);for(g=r+1,s-o>R((b-t)/g)&&n("overflow"),t+=(s-o)*g,o=s,l=0;w>l;++l)if(v=e[l],o>v&&++t>b&&n("overflow"),v==o){for(a=t,p=x;h=u>=p?C:p>=u+j?j:p-u,!(h>a);p+=x)m=a-h,y=x-h,A.push(T(c(h+m%y,0))),a=R(m/y);A.push(T(c(a,0))),u=d(t,g,r==i),t=0,++r}++t,++o}return A.join("")}function a(e){return r(e,function(e){return O.test(e)?l(e.slice(4).toLowerCase()):e})}function p(e){return r(e,function(e){return S.test(e)?"xn--"+s(e):e})}var h="object"==typeof exports&&exports,v="object"==typeof module&&module&&module.exports==h&&module,w="object"==typeof e&&e;(w.global===w||w.window===w)&&(o=w);var g,y,b=2147483647,x=36,C=1,j=26,m=38,A=700,I=72,F=128,E="-",O=/^xn--/,S=/[^ -~]/,L=/\x2E|\u3002|\uFF0E|\uFF61/g,M={overflow:"Overflow: input needs wider integers to process","not-basic":"Illegal input >= 0x80 (not a basic code point)","invalid-input":"Invalid input"},P=x-C,R=Math.floor,T=String.fromCharCode;if(g={version:"1.2.4",ucs2:{decode:f,encode:i},decode:l,encode:s,toASCII:p,toUnicode:a},"function"==typeof define&&"object"==typeof define.amd&&define.amd)define("punycode",function(){return g});else if(h&&!h.nodeType)if(v)v.exports=g;else for(y in g)g.hasOwnProperty(y)&&(h[y]=g[y]);else o.punycode=g}(this)}).call(this,"undefined"!=typeof global?global:"undefined"!=typeof self?self:"undefined"!=typeof window?window:{});
},{}],6:[function(require,module,exports){
"use strict";function hasOwnProperty(r,e){return Object.prototype.hasOwnProperty.call(r,e)}module.exports=function(r,e,t,n){e=e||"&",t=t||"=";var o={};if("string"!=typeof r||0===r.length)return o;var a=/\+/g;r=r.split(e);var s=1e3;n&&"number"==typeof n.maxKeys&&(s=n.maxKeys);var p=r.length;s>0&&p>s&&(p=s);for(var y=0;p>y;++y){var u,c,i,l,f=r[y].replace(a,"%20"),v=f.indexOf(t);v>=0?(u=f.substr(0,v),c=f.substr(v+1)):(u=f,c=""),i=decodeURIComponent(u),l=decodeURIComponent(c),hasOwnProperty(o,i)?isArray(o[i])?o[i].push(l):o[i]=[o[i],l]:o[i]=l}return o};var isArray=Array.isArray||function(r){return"[object Array]"===Object.prototype.toString.call(r)};
},{}],7:[function(require,module,exports){
"use strict";function map(r,e){if(r.map)return r.map(e);for(var t=[],n=0;n<r.length;n++)t.push(e(r[n],n));return t}var stringifyPrimitive=function(r){switch(typeof r){case"string":return r;case"boolean":return r?"true":"false";case"number":return isFinite(r)?r:"";default:return""}};module.exports=function(r,e,t,n){return e=e||"&",t=t||"=",null===r&&(r=void 0),"object"==typeof r?map(objectKeys(r),function(n){var i=encodeURIComponent(stringifyPrimitive(n))+t;return isArray(r[n])?map(r[n],function(r){return i+encodeURIComponent(stringifyPrimitive(r))}).join(e):i+encodeURIComponent(stringifyPrimitive(r[n]))}).join(e):n?encodeURIComponent(stringifyPrimitive(n))+t+encodeURIComponent(stringifyPrimitive(r)):""};var isArray=Array.isArray||function(r){return"[object Array]"===Object.prototype.toString.call(r)},objectKeys=Object.keys||function(r){var e=[];for(var t in r)Object.prototype.hasOwnProperty.call(r,t)&&e.push(t);return e};
},{}],8:[function(require,module,exports){
"use strict";exports.decode=exports.parse=require("./decode"),exports.encode=exports.stringify=require("./encode");
},{"./decode":6,"./encode":7}],9:[function(require,module,exports){
function Url(){this.protocol=null,this.slashes=null,this.auth=null,this.host=null,this.port=null,this.hostname=null,this.hash=null,this.search=null,this.query=null,this.pathname=null,this.path=null,this.href=null}function urlParse(t,s,e){if(t&&isObject(t)&&t instanceof Url)return t;var h=new Url;return h.parse(t,s,e),h}function urlFormat(t){return isString(t)&&(t=urlParse(t)),t instanceof Url?t.format():Url.prototype.format.call(t)}function urlResolve(t,s){return urlParse(t,!1,!0).resolve(s)}function urlResolveObject(t,s){return t?urlParse(t,!1,!0).resolveObject(s):s}function isString(t){return"string"==typeof t}function isObject(t){return"object"==typeof t&&null!==t}function isNull(t){return null===t}function isNullOrUndefined(t){return null==t}var punycode=require("punycode");exports.parse=urlParse,exports.resolve=urlResolve,exports.resolveObject=urlResolveObject,exports.format=urlFormat,exports.Url=Url;var protocolPattern=/^([a-z0-9.+-]+:)/i,portPattern=/:[0-9]*$/,delims=["<",">",'"',"`"," ","\r","\n","	"],unwise=["{","}","|","\\","^","`"].concat(delims),autoEscape=["'"].concat(unwise),nonHostChars=["%","/","?",";","#"].concat(autoEscape),hostEndingChars=["/","?","#"],hostnameMaxLen=255,hostnamePartPattern=/^[a-z0-9A-Z_-]{0,63}$/,hostnamePartStart=/^([a-z0-9A-Z_-]{0,63})(.*)$/,unsafeProtocol={javascript:!0,"javascript:":!0},hostlessProtocol={javascript:!0,"javascript:":!0},slashedProtocol={http:!0,https:!0,ftp:!0,gopher:!0,file:!0,"http:":!0,"https:":!0,"ftp:":!0,"gopher:":!0,"file:":!0},querystring=require("querystring");Url.prototype.parse=function(t,s,e){if(!isString(t))throw new TypeError("Parameter 'url' must be a string, not "+typeof t);var h=t;h=h.trim();var r=protocolPattern.exec(h);if(r){r=r[0];var o=r.toLowerCase();this.protocol=o,h=h.substr(r.length)}if(e||r||h.match(/^\/\/[^@\/]+@[^@\/]+/)){var a="//"===h.substr(0,2);!a||r&&hostlessProtocol[r]||(h=h.substr(2),this.slashes=!0)}if(!hostlessProtocol[r]&&(a||r&&!slashedProtocol[r])){for(var n=-1,i=0;i<hostEndingChars.length;i++){var l=h.indexOf(hostEndingChars[i]);-1!==l&&(-1===n||n>l)&&(n=l)}var c,u;u=-1===n?h.lastIndexOf("@"):h.lastIndexOf("@",n),-1!==u&&(c=h.slice(0,u),h=h.slice(u+1),this.auth=decodeURIComponent(c)),n=-1;for(var i=0;i<nonHostChars.length;i++){var l=h.indexOf(nonHostChars[i]);-1!==l&&(-1===n||n>l)&&(n=l)}-1===n&&(n=h.length),this.host=h.slice(0,n),h=h.slice(n),this.parseHost(),this.hostname=this.hostname||"";var p="["===this.hostname[0]&&"]"===this.hostname[this.hostname.length-1];if(!p)for(var f=this.hostname.split(/\./),i=0,m=f.length;m>i;i++){var v=f[i];if(v&&!v.match(hostnamePartPattern)){for(var g="",y=0,d=v.length;d>y;y++)g+=v.charCodeAt(y)>127?"x":v[y];if(!g.match(hostnamePartPattern)){var P=f.slice(0,i),b=f.slice(i+1),j=v.match(hostnamePartStart);j&&(P.push(j[1]),b.unshift(j[2])),b.length&&(h="/"+b.join(".")+h),this.hostname=P.join(".");break}}}if(this.hostname=this.hostname.length>hostnameMaxLen?"":this.hostname.toLowerCase(),!p){for(var O=this.hostname.split("."),q=[],i=0;i<O.length;++i){var x=O[i];q.push(x.match(/[^A-Za-z0-9_-]/)?"xn--"+punycode.encode(x):x)}this.hostname=q.join(".")}var U=this.port?":"+this.port:"",C=this.hostname||"";this.host=C+U,this.href+=this.host,p&&(this.hostname=this.hostname.substr(1,this.hostname.length-2),"/"!==h[0]&&(h="/"+h))}if(!unsafeProtocol[o])for(var i=0,m=autoEscape.length;m>i;i++){var A=autoEscape[i],E=encodeURIComponent(A);E===A&&(E=escape(A)),h=h.split(A).join(E)}var w=h.indexOf("#");-1!==w&&(this.hash=h.substr(w),h=h.slice(0,w));var R=h.indexOf("?");if(-1!==R?(this.search=h.substr(R),this.query=h.substr(R+1),s&&(this.query=querystring.parse(this.query)),h=h.slice(0,R)):s&&(this.search="",this.query={}),h&&(this.pathname=h),slashedProtocol[o]&&this.hostname&&!this.pathname&&(this.pathname="/"),this.pathname||this.search){var U=this.pathname||"",x=this.search||"";this.path=U+x}return this.href=this.format(),this},Url.prototype.format=function(){var t=this.auth||"";t&&(t=encodeURIComponent(t),t=t.replace(/%3A/i,":"),t+="@");var s=this.protocol||"",e=this.pathname||"",h=this.hash||"",r=!1,o="";this.host?r=t+this.host:this.hostname&&(r=t+(-1===this.hostname.indexOf(":")?this.hostname:"["+this.hostname+"]"),this.port&&(r+=":"+this.port)),this.query&&isObject(this.query)&&Object.keys(this.query).length&&(o=querystring.stringify(this.query));var a=this.search||o&&"?"+o||"";return s&&":"!==s.substr(-1)&&(s+=":"),this.slashes||(!s||slashedProtocol[s])&&r!==!1?(r="//"+(r||""),e&&"/"!==e.charAt(0)&&(e="/"+e)):r||(r=""),h&&"#"!==h.charAt(0)&&(h="#"+h),a&&"?"!==a.charAt(0)&&(a="?"+a),e=e.replace(/[?#]/g,function(t){return encodeURIComponent(t)}),a=a.replace("#","%23"),s+r+e+a+h},Url.prototype.resolve=function(t){return this.resolveObject(urlParse(t,!1,!0)).format()},Url.prototype.resolveObject=function(t){if(isString(t)){var s=new Url;s.parse(t,!1,!0),t=s}var e=new Url;if(Object.keys(this).forEach(function(t){e[t]=this[t]},this),e.hash=t.hash,""===t.href)return e.href=e.format(),e;if(t.slashes&&!t.protocol)return Object.keys(t).forEach(function(s){"protocol"!==s&&(e[s]=t[s])}),slashedProtocol[e.protocol]&&e.hostname&&!e.pathname&&(e.path=e.pathname="/"),e.href=e.format(),e;if(t.protocol&&t.protocol!==e.protocol){if(!slashedProtocol[t.protocol])return Object.keys(t).forEach(function(s){e[s]=t[s]}),e.href=e.format(),e;if(e.protocol=t.protocol,t.host||hostlessProtocol[t.protocol])e.pathname=t.pathname;else{for(var h=(t.pathname||"").split("/");h.length&&!(t.host=h.shift()););t.host||(t.host=""),t.hostname||(t.hostname=""),""!==h[0]&&h.unshift(""),h.length<2&&h.unshift(""),e.pathname=h.join("/")}if(e.search=t.search,e.query=t.query,e.host=t.host||"",e.auth=t.auth,e.hostname=t.hostname||t.host,e.port=t.port,e.pathname||e.search){var r=e.pathname||"",o=e.search||"";e.path=r+o}return e.slashes=e.slashes||t.slashes,e.href=e.format(),e}var a=e.pathname&&"/"===e.pathname.charAt(0),n=t.host||t.pathname&&"/"===t.pathname.charAt(0),i=n||a||e.host&&t.pathname,l=i,c=e.pathname&&e.pathname.split("/")||[],h=t.pathname&&t.pathname.split("/")||[],u=e.protocol&&!slashedProtocol[e.protocol];if(u&&(e.hostname="",e.port=null,e.host&&(""===c[0]?c[0]=e.host:c.unshift(e.host)),e.host="",t.protocol&&(t.hostname=null,t.port=null,t.host&&(""===h[0]?h[0]=t.host:h.unshift(t.host)),t.host=null),i=i&&(""===h[0]||""===c[0])),n)e.host=t.host||""===t.host?t.host:e.host,e.hostname=t.hostname||""===t.hostname?t.hostname:e.hostname,e.search=t.search,e.query=t.query,c=h;else if(h.length)c||(c=[]),c.pop(),c=c.concat(h),e.search=t.search,e.query=t.query;else if(!isNullOrUndefined(t.search)){if(u){e.hostname=e.host=c.shift();var p=e.host&&e.host.indexOf("@")>0?e.host.split("@"):!1;p&&(e.auth=p.shift(),e.host=e.hostname=p.shift())}return e.search=t.search,e.query=t.query,isNull(e.pathname)&&isNull(e.search)||(e.path=(e.pathname?e.pathname:"")+(e.search?e.search:"")),e.href=e.format(),e}if(!c.length)return e.pathname=null,e.path=e.search?"/"+e.search:null,e.href=e.format(),e;for(var f=c.slice(-1)[0],m=(e.host||t.host)&&("."===f||".."===f)||""===f,v=0,g=c.length;g>=0;g--)f=c[g],"."==f?c.splice(g,1):".."===f?(c.splice(g,1),v++):v&&(c.splice(g,1),v--);if(!i&&!l)for(;v--;v)c.unshift("..");!i||""===c[0]||c[0]&&"/"===c[0].charAt(0)||c.unshift(""),m&&"/"!==c.join("/").substr(-1)&&c.push("");var y=""===c[0]||c[0]&&"/"===c[0].charAt(0);if(u){e.hostname=e.host=y?"":c.length?c.shift():"";var p=e.host&&e.host.indexOf("@")>0?e.host.split("@"):!1;p&&(e.auth=p.shift(),e.host=e.hostname=p.shift())}return i=i||e.host&&c.length,i&&!y&&c.unshift(""),c.length?e.pathname=c.join("/"):(e.pathname=null,e.path=null),isNull(e.pathname)&&isNull(e.search)||(e.path=(e.pathname?e.pathname:"")+(e.search?e.search:"")),e.auth=t.auth||e.auth,e.slashes=e.slashes||t.slashes,e.href=e.format(),e},Url.prototype.parseHost=function(){var t=this.host,s=portPattern.exec(t);s&&(s=s[0],":"!==s&&(this.port=s.substr(1)),t=t.substr(0,t.length-s.length)),t&&(this.hostname=t)};
},{"punycode":5,"querystring":8}],10:[function(require,module,exports){
function convert(e,t){if("object"!=typeof e)throw new Error("resourceListing must be an object");Array.isArray(t)||(t=[]);var r={},n={},i={swagger:"2.0",info:buildInfo(e),paths:{}};return e.authorizations&&(i.securityDefinitions=buildSecurityDefinitions(e,r)),e.basePath&&assignPathComponents(e.basePath,i),extend(n,e.models),Array.isArray(e.apis)&&e.apis.forEach(function(t){Array.isArray(t.operations)&&(i.paths[t.path]=buildPath(t,e))}),t.forEach(function(e){e.basePath&&assignPathComponents(e.basePath,i),Array.isArray(e.apis)&&(e.apis.forEach(function(t){i.paths[t.path]=buildPath(t,e)}),Object.keys(e.models).length&&extend(n,transformAllModels(e.models)))}),Object.keys(n).length&&(i.definitions=transformAllModels(n)),i}function buildInfo(e){var t={version:e.apiVersion,title:"Title was not specified"};return"object"==typeof e.info&&(e.info.title&&(t.title=e.info.title),e.info.description&&(t.description=e.info.description),e.info.contact&&(t.contact={email:e.info.contact}),e.info.license&&(t.license={name:e.info.license,url:e.info.licenseUrl}),e.info.termsOfServiceUrl&&(t.termsOfService=e.info.termsOfServiceUrl)),t}function assignPathComponents(e,t){var r=urlParse(e);t.host=r.host,t.basePath=r.path,t.schemes=[r.protocol.substr(0,r.protocol.length-1)]}function processDataType(e){return e.$ref&&-1===e.$ref.indexOf("#/definitions/")?e.$ref="#/definitions/"+e.$ref:e.items&&e.items.$ref&&-1===e.items.$ref.indexOf("#/definitions/")&&(e.items.$ref="#/definitions/"+e.items.$ref),e.minimum&&(e.minimum=parseInt(e.minimum)),e.maximum&&(e.maximum=parseInt(e.maximum)),e.defaultValue&&(e["default"]="integer"===e.type?parseInt(e.defaultValue,10):"number"===e.type?parseFloat(e.defaultValue):e.defaultValue,delete e.defaultValue),e}function buildPath(e,t){var r={};return e.operations.forEach(function(e){var n=e.method.toLowerCase();r[n]=buildOperation(e,t.produces,t.consumes)}),r}function buildOperation(e,t,r){var n={responses:{},description:e.description||""};return e.summary&&(n.summary=e.summary),e.nickname&&(n.operationId=e.nickname),t&&(n.produces=t),r&&(n.consumes=r),Array.isArray(e.parameters)&&e.parameters.length&&(n.parameters=e.parameters.map(function(e){return buildParameter(processDataType(e))})),Array.isArray(e.responseMessages)&&e.responseMessages.forEach(function(e){n.responses[e.code]=buildResponse(e)}),Object.keys(n.responses).length||(n.responses={200:{description:"No response was specified"}}),n}function buildResponse(e){var t={};return t.description=e.message,t}function buildParameter(e){var t={"in":e.paramType,description:e.description,name:e.name,required:!!e.required},r=["string","number","boolean","integer","array","void","File"];return-1===r.indexOf(e.type)?t.schema={$ref:"#/definitions/"+e.type}:t.type=e.type.toLowerCase(),"form"===t["in"]&&(t["in"]="formData"),["default","maximum","minimum","items"].forEach(function(r){e[r]&&(t[r]=e[r])}),t}function buildSecurityDefinitions(e,t){var r={};return Object.keys(e.authorizations).forEach(function(n){var i=e.authorizations[n],o=function(e){var t=r[e||n]={type:i.type};return i.passAs&&(t["in"]=i.passAs),i.keyname&&(t.name=i.keyname),t};i.grantTypes?(t[n]=[],Object.keys(i.grantTypes).forEach(function(e){var r=i.grantTypes[e],s=n+"_"+e,a=o(s);switch(t[n].push(s),a.flow="implicit"===e?"implicit":"accessCode",e){case"implicit":a.authorizationUrl=r.loginEndpoint.url;break;case"authorization_code":a.authorizationUrl=r.tokenRequestEndpoint.url,a.tokenUrl=r.tokenEndpoint.url}i.scopes&&(a.scopes={},i.scopes.forEach(function(e){a.scopes[e.scope]=e.description||"Undescribed "+e.scope}))})):o()}),r}function transformModel(e){"object"==typeof e.properties&&Object.keys(e.properties).forEach(function(t){e.properties[t]=processDataType(e.properties[t])})}function transformAllModels(e){if("object"!=typeof e)throw new Error("models must be object");var t={};return Object.keys(e).forEach(function(r){var n=e[r];transformModel(n),n.subTypes&&(t[r]=n.subTypes,delete n.subTypes)}),Object.keys(t).forEach(function(r){t[r].forEach(function(t){var n=e[t];n&&(n.allOf=(n.allOf||[]).concat({$ref:"#/definitions/"+r}))})}),e}function extend(e,t){if("object"!=typeof e)throw new Error("source must be objects");"object"==typeof t&&Object.keys(t).forEach(function(r){e[r]=t[r]})}var urlParse=require("url").parse;"undefined"==typeof window?module.exports=convert:window.SwaggerConverter=window.SwaggerConverter||{convert:convert};
},{"url":9}],11:[function(require,module,exports){
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

},{}],12:[function(require,module,exports){
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


},{}],13:[function(require,module,exports){
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
},{}],14:[function(require,module,exports){
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

},{}],15:[function(require,module,exports){
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
},{}],16:[function(require,module,exports){
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


},{}],17:[function(require,module,exports){
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
},{}],18:[function(require,module,exports){
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

},{}],19:[function(require,module,exports){
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

},{}],20:[function(require,module,exports){
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

},{}],21:[function(require,module,exports){
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
},{}],22:[function(require,module,exports){
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

},{}],23:[function(require,module,exports){
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