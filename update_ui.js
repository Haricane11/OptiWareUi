const fs = require('fs');
const path = 'c:/Users/95988/Desktop/OptiWare/frontend/components/WarehouseWizard.js';
let content = fs.readFileSync(path, 'utf8');

// Target the specific width input in Step 2.
// It's the only one with formData.widthM AND disabled AND bg-gray-100.
content = content.replace(
  /value=\{formData\.widthM\}\s+disabled\s+className="w-full p-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-600"/,
  `value={formData.floorWidths?.[i] ?? formData.widthM}
                          onChange={e => {
                            const val = parseFloat(e.target.value);
                            const next = [...(formData.floorWidths || [])];
                            next[i] = isNaN(val) ? 0 : val;
                            setFormData({ ...formData, floorWidths: next });
                          }}
                          className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"`
);

content = content.replace('Width is fixed to warehouse width.', 'Width defaults to warehouse width.');

fs.writeFileSync(path, content);
console.log('Update complete');
