const fs = require('fs');
const path = require('path');

const docsDir = path.join(__dirname, 'docs');
const outputFile = path.join(__dirname, 'docs-data.js');

let content = 'window.docsContent = {\n';

const files = fs.readdirSync(docsDir);

for (const file of files) {
    if (file.endsWith('.md')) {
        const filePath = path.join(docsDir, file);
        const fileContent = fs.readFileSync(filePath, 'utf8');
        // Escape backticks and standard escape characters
        const escapedContent = fileContent.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');
        content += `  "docs/${file}": \`${escapedContent}\`,\n`;
    }
}

content += '};\n';

fs.writeFileSync(outputFile, content);
console.log('docs-data.js generated successfully.');
