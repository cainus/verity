var difflet = require('difflet');
var deepEqual = require('deep-equal');
var expect = require("expect.js");
var util = require('util');
var urlgrey = require('urlgrey');
var request = require('request');
var Reaper = require('reaper');

var isString = function(str){
  return toString.call(str) == '[object String]';
};

// checks a response holistically, rather than in parts,
// which results in better error output.
var Verity = function(uri, method){
  if (!(this instanceof Verity)) {
    return new Verity(uri, method);
  }
  this.uri = urlgrey(uri || 'http://localhost:80');
  this.method = method || 'GET';
  this.body = '';
  this.client = request.defaults({jar:true, timeout:3000});
  this.headers = {};
  this.expectedBody = '';
  this.expectedStatus = 200;
  this.expectedHeaders = {};
  this.befores = [];
  this.jsonModeOn = false;
  this.message = '';
  this.log = function(){
    var addition = '';
    for (var k in arguments){
      if (isString(arguments[k])){
        addition += arguments[k];
      } else {
        addition += util.inspect(arguments[k]) + " ";
      }
    }
    addition += "\n";
    this.message += addition;
    //process.stdout.write(addition);
  };
  this.onerror = function(err, method, uri, headers, body){
    this.log("");
    this.log("unexpected error: ", (err.message || err));
    this.log(util.inspect(err));
    this.log("method: ", method);
    this.log("uri: ", uri);
    this.log("body: ", body);
    this.log("headers: ", headers);
    this.log("");
    throw "unexpected error: " + JSON.stringify((err.message || err));
  };
};

Verity.prototype.onError = function(cb){
  this.onerror = cb;
};

Verity.prototype.expectBody = function(body){
  this.expectedBody = body;
};
Verity.prototype.expectStatus = function(code){
  this.expectedStatus = code;
};
Verity.prototype.expectHeader = function(name, value){
  this.expectedHeaders[name] = value;
};
Verity.prototype.jsonMode = function(){
  this.expectHeader('content-type', 'application/json');
  this.jsonModeOn = true;
};
Verity.prototype.before = function(cb){
  this.befores.push(cb);
};
Verity.prototype.authStrategy = function(creds, cb){
  // replace this with a function that logs the user in
  return cb(null);
};
Verity.prototype.login = function(creds){
  this.creds = creds;
};
Verity.prototype.test = function(cb){
  this.message = '';
  // TODO make this all one assertion error message
  var options = { headers : this.headers};
  options.method = this.method.toLowerCase();
  options.url = this.uri.toString();
  if (!!this.body){
    console.log("got a body!!: ", this.body);
    if (this.jsonModeOn){
      options.headers['content-type'] = 'application/json';
      if (!isString(this.body)){
        options.body = JSON.stringify(this.body);
      }
    } else {
      options.body = this.body;
    }
  }
  var that = this;
  // TODO: if this.creds, log the user in!!!
  console.log("about to request: ", options);
  if (this.creds){
    this.authStrategy(this.creds, function(){
      makeRequest(that, options, cb);
    });
  } else {
    makeRequest(that, options, cb);
  }
};

var makeRequest = function(that, options, cb){
    that.client(options, function(err, response, body){
      if (err) {
        return that.onerror(err,
                            options.method,
                            options.url,
                            options.headers,
                            options.body);
      }
      if (that.jsonModeOn){
        try {
          body = JSON.parse(body);
        } catch(ex){
          // do nothing if it doesn't parse.
          // it will stay as a string
        }
      }
      var failed = false;
      that.log("STATUS: ");
      try {
        that.log('actual: ', response.statusCode);
        that.log('expected: ', that.expectedStatus);
        expect(response.statusCode).to.equal(that.expectedStatus);
      } catch(ex) {
        that.log("Failure: ");
        that.log(ex);
        failed = true;
      }
      that.log('');
      for(var k in that.expectedHeaders){
        var v = that.expectedHeaders[k];
        if (k == 'content-type'){
          var reaper = new Reaper();
          reaper.register(v);
          expect(reaper.isAcceptable('application/json')).to.equal(true);
        } else {
          expect(response.headers[k]).to.equal(v);
        }
      }
      that.log("BODY: ");

      if (!deepEqual(body, that.expectedBody)){
        that.log("Failure: ");
        that.logObjectDiff(body, that.expectedBody);
        failed = true;
      }
      if (failed){
        throw that.message;
      }
      return cb();
    });

};

Verity.prototype.logObjectDiff = function (actual, expected){
    this.log(difflet({indent:2}).compare(actual, expected));
    this.log("\n\nactual");
    this.log(JSON.stringify(actual, null, 2));
    this.log("\n\nexpected");
    this.log(JSON.stringify(expected, null, 2));
    this.log("\n\n");
};

module.exports = Verity;

