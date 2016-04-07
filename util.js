var deepEqual = require('deep-equal');
var difflet = require('difflet');
var diff = difflet({indent: 2, comment: true}).compare;
var deepmerge = require("deepmerge");

var assertObjectEquals = function (actual, expected){
  if (!deepEqual(actual, expected)){
    throw new Error("ObjectEqualityAssertionError:\n\u001b[0m" + diff(expected, actual));
  }
};

/*
  Tests if object a is a subset of object b.

  Easiest way to do this is

    b' = deepmerge(b, a)
    return equal(b', b)

  Will not necessarily work if any values are arrays
  of elements, since the arrays would need to be in
  sorted order. Unclear what that means for arrays
  of objects.
 */
var isSubset = function(subset, actual) {
  var expected;
  expected = deepmerge(actual, subset);
  if(!deepEqual(actual, expected)) {
    throw new Error("ObjectPartialAssertionError\n\u001b[0m" + diff(expected, actual));
  }
};

module.exports = {
  assertObjectEquals: assertObjectEquals,
  isSubset: isSubset
};
