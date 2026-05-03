import os

docs_dir = 'docs'
output_file = 'docs-data.js'

content = 'window.docsContent = {\n'

for file_name in os.listdir(docs_dir):
    if file_name.endswith('.md'):
        file_path = os.path.join(docs_dir, file_name)
        with open(file_path, 'r', encoding='utf-8') as f:
            file_content = f.read()
        
        escaped_content = file_content.replace('\\', '\\\\').replace('`', '\\`').replace('$', '\\$')
        content += f'  "docs/{file_name}": `{escaped_content}`,\n'

content += '};\n'

with open(output_file, 'w', encoding='utf-8') as f:
    f.write(content)

print('docs-data.js generated successfully.')
