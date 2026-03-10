import zipfile
import xml.etree.ElementTree as ET
import sys

def extract_text(file_path):
    try:
        docx = zipfile.ZipFile(file_path, 'r')
        xml_content = docx.read('word/document.xml')
        tree = ET.fromstring(xml_content)
        namespaces = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
        
        paragraphs = []
        for p in tree.findall('.//w:p', namespaces):
            text = ''.join(t.text for t in p.findall('.//w:t', namespaces) if t.text)
            if text:
                paragraphs.append(text)
        with open('extracted_report.txt', 'w', encoding='utf-8') as f:
            f.write('\n'.join(paragraphs))
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    extract_text(sys.argv[1])
