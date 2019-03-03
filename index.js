'use strict';

const Promise = require('bluebird');

/* module exports a single function `retrier`
 *
 * `retrier` function signature
 *     `subject_promise`: function that returns a Promise that will be retried.
 *                        If this promise resolves, `retrier` resolves.
 *                        If this promise rejects, `retrier` will either retry it based on the logic in `retry_controller`
 *     `retry_controller`: function that takes an `error` as a parameter and returns a Promise.
 *                         When this Promise resolves, 'subject_promise' is retried.
 *                         When this Promise rejects, `retrier` rejects with the given `error`.
 *                         This may also take an object of the following form:
 *                             {
 *                                 predefined_retry_controller: {
 *                                     param1: value1,
 *                                     param2: value2
 *                                 }
 *                             }
*/

function retrier(subject_promise_fn, retry_controller) {

    // perform some validation
    var retry_controller_fn = null;
    if (typeof(retry_controller) == 'function') {
        retry_controller_fn = retry_controller;
    } else if (typeof(retry_controller) == 'object' && Object.keys(retry_controller).length == 1) {
        var predef_retry_fnname = Object.keys(retry_controller)[0];
        if (!retrier.retry_fn[predef_retry_fnname]) {
            throw new Error(`No such predefined retry promise function: ${predef_retry_fnname}`)
        } else {
            var arg_vals = []; // collects the required params of the predefined retry fn as we validate the object
            retrier.retry_fn[predef_retry_fnname].params.forEach((keyobj, i) => {
                var key = Object.keys(keyobj)[0];
                if (retry_controller[Object.keys(retry_controller)[0]][key]) {
                    var forvalidation_keytype = typeof(retry_controller[Object.keys(retry_controller)[0]][key]);
                    var expected_keytype = retrier.retry_fn[predef_retry_fnname].params[i][key];
                    if (forvalidation_keytype !== expected_keytype) {
                        throw new Error(`${predef_retry_fnname}.${key} is incorrect type: ${forvalidation_keytype} instead of ${expected_keytype}`);
                    } else {
                        arg_vals.push(retry_controller[Object.keys(retry_controller)[0]][key]);
                    }
                } else {
                    throw new Error(`${predef_retry_fnname} is missing a property: ${key}`);
                }
            });
            retry_controller_fn = retrier.retry_fn[predef_retry_fnname].fn(...arg_vals);
        }
    } else {
        throw new Error(`Invalid parameters for retry promise function`);
    }


    // wrap the subject with the retry-caller and start
    function subject_caller() {
        return subject_promise_fn()
        .catch(err => {
            return retry_controller_fn(err)
            .then(() => {
                return subject_caller();
            });
        });
    }
    return subject_caller();
}

// simple retry function, with x millisecond delay, for up to n retries
function constant_timer_retry(x_ms_between_retries_, n_retries_) {
    var x_ms_between_retries = Math.floor(x_ms_between_retries_);
    var n_retries = Math.floor(n_retries_);
    var retries_remaining = n_retries;
    return err => {
        return new Promise((resolve, reject) => {
            if (retries_remaining != 0) {
                //console.log(`Yes, retrying in ${x_ms_between_retries} milliseconds...\n\n`);
                setTimeout(() => {
                    //console.log(`Retry #${n_retries - retries_remaining + 1}: Trying the subject promise`);
                    retries_remaining -= 1;
                    resolve();
                }, x_ms_between_retries);
            } else {
                //console.log(`No, enough retries done. Giving up.\n\n`);n_retries
                reject(err);
            }
        });
    }
}

retrier.retry_fn = {
    constant_timer_retry: {
        fn: constant_timer_retry,
        params: [
            {x_ms_between_retries: 'number'},
            {n_retries: 'number'}
        ]
    }
}

module.exports = retrier;

if (require.main === module) {
    // run tests, function that returns the promise to be retried, resolves with probability of 20%
    function for_retrying() {
        return new Promise((resolve, reject) => {
            var value = Math.random();
            if (value < 0.1) {
                console.log('Test promise resolves. We are done.');
                resolve(value);
            } else {
                console.log(`Test promise rejects with value ${value}.`);
                reject(new Error(`Random resolve fail.`));
            }
        });
    }

    var time_between = 2000;
    var num_retries = 3;

    // simple retry function, with x millisecond delay, for up to n retries
    // function constant_timer_retry(x_ms_between_retries_, n_retries_) {
    //     var x_ms_between_retries = Math.floor(x_ms_between_retries_);
    //     var n_retries = Math.floor(n_retries_);
    //     var retries_remaining = n_retries;
    //     return err => {
    //         return new Promise((resolve, reject) => {
    //             if (retries_remaining != 0) {
    //                 console.log(`Retrying in ${x_ms_between_retries} milliseconds...\n\n`);
    //                 setTimeout(() => {
    //                     console.log(`Retry #${n_retries - retries_remaining + 1}: Trying the subject promise'`);
    //                     retries_remaining -= 1;
    //                     resolve();
    //                 }, x_ms_between_retries);
    //             } else {
    //                 console.log(`Enough retries done. Giving up.\n\n`);
    //                 reject(err);
    //             }
    //         });
    //     }
    // }
    //retrier(for_retrying, constant_timer_retry(time_between, num_retries))

    // using a pre-defined retry function
    retrier(for_retrying, { constant_timer_retry: { x_ms_between_retries: time_between, n_retries: num_retries }})
    .then(value => {
        console.log(`Final state: ${value}`);
    })
    .catch(err => {
        console.log(`Final state: Given up after ${num_retries} retries.\n${err.toString()}`);
    });
}
