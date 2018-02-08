#!/usr/bin/env node --harmony
var program = require('commander')
var fs = require('fs-extra')
var mkdirp = require('mkdirp')
var Confirm = require('prompt-confirm')
var request = require('request-promise')
var JSONStream = require('JSONStream')

program
  .version(require('./package.json').version)
  .option('-b, --backendurl <backendurl>', 'The backend url you want to dump')
  .option('-u, --username <username>', 'The user to authenticate as')
  .option('-p, --password <password>', 'The user\'s password')
  .parse(process.argv)

console.log('Dump script starting.')

console.log('Backendurl\t%s \nUsername\t%s \nPassword\t*****', program.backendurl, program.username)

function dump () {
  mkdirp('dump', function (err) {

    var auth = `${program.username}:${program.password}`
    var headers = {
      'Authorization': `Basic ${new Buffer(auth).toString('base64')}`
    }

    var schemas, data

    console.log('Fetching /schema')

    request({
      url: `${program.backendurl}/1/schema`,
      json: true,
      headers
    })

    .then(

      function (_schemas) {
        console.log('Got schemas from /schema')
        console.log('Writing dump/schema.json')
        schemas = _schemas
        return fs.writeJson('dump/schema.json', schemas)
      },
      rejectLog('Error fetching /schema')

    )

    .then(

      function () {
        console.log('Wrote dump/schema.json')
        console.log('Fetching data for every schema')

        var _data = []

        return Object.keys(schemas).reduce((previous, schema) => {
          return previous.then(function () {
            return getAllSchemaData(program.backendurl, headers, schema).then(function (ret) {
              _data.push(ret)
              return Promise.resolve(_data)
            })
          })
        }, Promise.resolve(_data))

      },
      rejectLog('Error writing dump/schema.json')

    )

    .then(

      function (_data) {
        console.log('Got data for every schema')
        console.log('Writing data files')
        data = _data
        var schemaDatasWrite = []
        data.forEach(function (schemaAndResults) {
          console.log(`dump/data.${schemaAndResults.schema}.json (${schemaAndResults.results.length} objects)`)
          schemaDatasWrite.push(new Promise((resolve, reject) => {

            var file = `dump/data.${schemaAndResults.schema}.json`
            var transformStream = JSONStream.stringify()
            var outputStream = fs.createWriteStream(file)
            transformStream.pipe(outputStream)
            schemaAndResults.results.forEach(transformStream.write)
            transformStream.end()
            resolve()

            //fs.writeJson(`dump/data.${schemaAndResults.schema}.json`, schemaAndResults.results).then(() => {
          }))
        })
        return Promise.all(schemaDatasWrite)
      },
      rejectLog('Error fetching data')

    )

    .then(

      function () {
        console.log('Wrote data files')
        console.log('Fetching credentials')
        return getAllCredentials(program.backendurl, headers)
      },
      rejectLog('Error writing data files.')

    )

    .then(

      function (_credentials) {
        console.log('Got credentials')
        console.log('Writing credentials file')
        return fs.writeJson(`dump/data.credentials.json`, _credentials)
      },
      rejectLog('Error fetching credentials.')

    )

    .then(

      function (credentials) {
        console.log('Credentials written')
        // END
        console.log('Finished with success !')
      },
      rejectLog('Error writing credentials file.')

    )

  })
}

new Confirm(`Confirm ? This will create a folder dump/ where you are right now`).ask(function (answer) {
  if (answer) {
    dump()    
  } else {
    console.log('Ending')
  }
})

function getAllSchemaData (backendurl, headers, schema) {
  var get = function(backendurl, headers, schema, results, from, size, resolve, reject) {

    var delay = 10
    if (from > 0) {
      delay = 100
    }
    
    console.log(`fetching data ... ${backendurl}/1/search/${schema} ... in ${delay/1000} seconds`)

    setTimeout(function () {
      request({
        url: `${backendurl}/1/search/${schema}`,
        json: true,
        headers,
        method: 'POST',
        body: {
          from,
          size,
          query: {
            'range': {
               'meta.createdAt': {
                   'gte': '01/11/2017',
                   'lte': '28/02/2018',
                   'format': 'dd/MM/yyyy'
               }
           }
          }
        }
      }).then(function (res) {
        console.log(`fetched data ... ${backendurl}/1/search/${schema} ... from ${from} size ${size} total ${res.total}`)
        results = results.concat(res.results)
        if (results.length < res.total) {
          from = from + size
          
          console.log(`(other(s) request(s) needed for schema ${schema} for total ${res.total})`)

          if (from + size > 10000) {
            console.log(`spacedog limitation ! cannot fetch more than 10k elements for schema ${schema} ... resolving anyway`)
            resolve({
              schema,
              results
            })  
          } else {
            get(backendurl, headers, schema, results, from, size, resolve, reject)
          }

        } else {
          resolve({
            schema,
            results
          })
        }
      }, reject)
    }, delay)
  }

  var _size = 1000
  if (schema === 'photo') {
    _size = 10
  }

  return new Promise((resolve, reject) => {
    get(backendurl, headers, schema, [], 0, _size, resolve, reject)
  })
}


function getAllCredentials (backendurl, headers) {
  var get = function(backendurl, headers, results, from, size, resolve, reject) {
    request({
      url: `${backendurl}/1/credentials?from=${from}&size=${size}`,
      headers,
      method: 'GET',
      json: true
    }).then(function (res) {
      results = results.concat(res.results)
      if (results.length < res.total) {
        from = from + size
        if (from >= 1000) {
          resolve(results)  
        } else if (from + size > 1000) {
          size = 1000 - from
          get(backendurl, headers, results, from, size, resolve, reject)
        } else {
          get(backendurl, headers, results, from, size, resolve, reject)
        }
      } else {
        resolve(results)
      }
    }, reject)
  }

  return new Promise((resolve, reject) => {
    get(backendurl, headers, [], 0, 1000, resolve, reject)
  })
}

function rejectLog (message) {
  return function (err) {
    console.error(err)
    console.error(message)
    console.error('Stopping.')
  }
}

