#!/usr/bin/env node --harmony
var program = require('commander')
var fs = require('fs-extra')
var mkdirp = require('mkdirp')
var Confirm = require('prompt-confirm')
var request = require('request-promise')

program
  .version(require('./package.json').version)
  .option('-b, --backendurl <backendurl>', 'The backend url you want to dump')
  .option('-u, --username <username>', 'The user to authenticate as')
  .option('-p, --password <password>', 'The user\'s password')
  .option('-m, --newpassword <newpassword>', 'Credentials password. If not set, `%Azerty12345` will be used')
  .parse(process.argv)

console.log('Restore script starting.')

var defaultPassword = '%Azerty12345'
if (program.newpassword) {
  defaultPassword = program.newpassword
}

console.log('Backendurl\t%s \nUsername\t%s \nPassword\t***** \nNewPassword\t%s', program.backendurl, program.username, defaultPassword)

function restore () {

  var auth = `${program.username}:${program.password}`
  var headers = {
    'Authorization': `Basic ${new Buffer(auth).toString('base64')}`
  }

  console.log('Reading dump/schema.json')

  var schemas, data

  fs.readJson('dump/schema.json')

  .then(

    function (_schemas) {
      console.log('Schema.json read')
      console.log('Sending POST /schemas/<schema> for each schema of schema.json')
      schemas = _schemas
      var schemasRequests = []
      Object.keys(schemas).forEach(function (schema) {
        var body = {}
        body[schema] = schemas[schema]
        schemasRequests.push(request({
          url: `${program.backendurl}/1/schema/${schema}`,
          json: true,
          method: 'POST',
          headers,
          body
        }))
      })
      return Promise.all(schemasRequests)

    }, 
    rejectLog('Error reading dump/schema')

  )

  .then(

    function () {
      console.log('Schemas created')
      console.log('Reading json data files')
      var dataReads = []
      Object.keys(schemas).forEach(function (schema) {
        dataReads.push(new Promise (function (resolve, reject) {
          var currentSchema = schema
          fs.readJson(`dump/data.${schema}.json`).then(function (data) {
            resolve({
              schema: currentSchema,
              data
            })
          })
        }))
      })
      return Promise.all(dataReads)
    }, 
    rejectLog('Error creating schema.')

  )

  .then(

    function(_data) {
      data = _data
      console.log('Json data files read')
      console.log('Preparing batch requests to populate backend')
      var allRequests = []
      data.forEach(function (d) {
        var schema = d.schema
        d.data.forEach(function (o) {
          var objectId = o.meta.id
          delete o.meta
          allRequests.push({
            method: 'POST',
            path: `/1/data/${schema}/?id=${objectId}`,
            content: o
          })
        })
      })
      var batch = []
      var currentTen = []
      for (var i = 0 ; i <= allRequests.length ; i++) {
        currentTen.push(allRequests[i])
        if (i % 10 == 0) {
          batch.push(currentTen)
          currentTen = []
        }
      }
      console.log(`Batch requests prepared (${allRequests.length} or ${batch.length} HTTP requests)`)
      return Promise.resolve(batch)
    }, 
    rejectLog('Error reading json data files.')

  )

  .then(

    function(_batch) {
      console.log('Chaining batch requests. Hold on to your butt.')
      var i = 1
      return _batch.reduce(function (previous, item) {
        return previous.then(function (previousValue) {
          process.stdout.write(`${i}...`)
          i++
          return request({
            method: 'POST',
            url: `${program.backendurl}/1/batch`,
            json: true,
            headers,
            body: item
          })
        })
      }, Promise.resolve())
    },
    rejectLog('Error preparing batch requests.')

  )

  .then(

    function() {
      console.log('Batch request executed.')
      console.log('Reading credentials file.')
      return fs.readJson('dump/data.credentials.json')
    },
    rejectLog('Error executing batch requets.')

  )

  .then(

    function(_credentials) {
      console.log('Credentials file read.')
      console.log(`Restoring credentials with password for every user : ${defaultPassword} `)
      var credentialsRequests = []
      _credentials.forEach(function (c) {
        c.password = defaultPassword
        credentialsRequests.push(request({
          method: 'POST',
          url: `${program.backendurl}/1/credentials`,
          json: true,
          headers,
          body: c
        }))
      })
      return Promise.all(credentialsRequests)
    },
    rejectLog('Error executing batch requets.')

  )
  
  .then(

    function(_credentials) {
      console.log('Credentials populated.')
      // END
      console.log('Finished with success !')
    },
    rejectLog('Error populating credentials.')

  )

}

new Confirm(`Confirm ? This will empty the selected backend and restore from what is in the dump/ folder`).ask(function (answer) {
  if (answer) {
    restore()    
  } else {
    console.log('Ending')
  }
})

function rejectLog (message) {
  return function (err) {
    console.error(err)
    console.error(message)
    console.error('Stopping.')
  }
}


