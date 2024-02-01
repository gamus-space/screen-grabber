'use strict';

const fs = require('fs');

function tree(root) {
  let queue = [''];
  let result = [];
  while (queue.length > 0) {
    const dir = queue.shift();
    fs.readdirSync(`${root}/${dir}`).forEach(entry => {
      const entryPath = `${dir === '' ? '' : dir + '/'}${entry}`;
      const stat = fs.statSync(`${root}/${entryPath}`);
      if (stat.isDirectory())
        queue.push(entryPath);
      else
        result.push(entryPath);
    });
  }
  return result;
}

exports.tree = tree;
