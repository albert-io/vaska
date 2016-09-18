var _ = require('lodash');
var express = require('express');
var app = express();

const USER_DATA = [
  {
    name: 'Peter',
    username: 'goldendase',
    status: 'active',
    currentTask: 'Presenting'
  },
  {
    name: 'Dan',
    username: 'dc',
    status: 'active',
    currentTask: 'Silently judging'
  },
  {
    name: 'Jaime',
    username: 'jaime',
    status: 'inactive',
    currentTask: 'Sleeping'
  }
];

app.get('/users/:username', (req, res) => {
  const username = req.params.username;
  const user = _.find(USER_DATA, (user) => user.username === username)
  if (!user) {
    res.status(404).send({status: 'Not found.'});
  } else {
    res.status(200).send(user);
  }
});

app.get('/users', (req, res) => {
  res.send(USER_DATA);
});

// app.listen(3000, function () {
//   console.log('Test server running on port 3000.');
// });

module.exports = app;
