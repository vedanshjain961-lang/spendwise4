const express = require('express');
const app = express();
app.listen(3001, () => { console.log('Listening on 3001'); });
setInterval(() => {}, 100000);
