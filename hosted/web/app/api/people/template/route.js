import * as XLSX from 'xlsx';
import { getActingContext } from '../../../../lib/authContext.js';

// "Download blank sheet": an Excel file with exactly the columns the import
// understands, plus a second tab explaining how to fill it in. The
// instructions tab has no name column, so import skips it automatically.
export async function GET() {
  const ctx = await getActingContext();
  if (!ctx) return new Response('Not signed in', { status: 401 });

  const headers = ['First Name', 'Last Name', 'Email', 'Role / Subject', 'School / Organization', 'Grade / Level'];
  const people = XLSX.utils.aoa_to_sheet([headers]);
  people['!cols'] = headers.map((h) => ({ wch: Math.max(18, h.length + 4) }));

  const help = XLSX.utils.aoa_to_sheet([
    ['How to use this sheet'],
    [''],
    ['1. Go to the "People" tab.'],
    ['2. Put one person on each row. First Name, Last Name, and Email are needed.'],
    ['3. The other columns are optional. Leave them blank if you don\'t know.'],
    ['4. Save the file, then in Signal go to People and click "Import from Excel".'],
    [''],
    ['If someone teaches two subjects or works at two places, you can put them on two rows.'],
    ['Signal will notice it is the same person and combine them.'],
  ]);
  help['!cols'] = [{ wch: 90 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, people, 'People');
  XLSX.utils.book_append_sheet(workbook, help, 'How to use');

  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="Signal people - blank sheet.xlsx"',
    },
  });
}
