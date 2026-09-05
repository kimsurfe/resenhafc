import sys
with open('app.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

def replace_line(num, old, new):
    idx = num - 1
    if old in lines[idx]:
        lines[idx] = lines[idx].replace(old, new)
    else:
        print(f"Failed to find {old} on line {num}")

replace_line(347, "p.type === 'mensalista'", "p.type && p.type.startsWith('mensalista')")
replace_line(348, " !== 'goleiro'", " !== 'goleiro' && p.type !== 'mensalista_isento'")
replace_line(410, "p.type === 'mensalista'", "p.type && p.type.startsWith('mensalista')")
replace_line(419, "p.type === 'mensalista'", "p.type && p.type.startsWith('mensalista')")
replace_line(584, "p.type === 'mensalista'", "p.type && p.type.startsWith('mensalista')")
replace_line(588, "=== 'goleiro'", "=== 'goleiro' || p.type === 'mensalista_isento'")
replace_line(590, " !== 'goleiro'", " !== 'goleiro' && p.type !== 'mensalista_isento'")
replace_line(704, "p.type === 'mensalista'", "p.type && p.type.startsWith('mensalista')")
replace_line(735, " !== 'goleiro'", " !== 'goleiro' && p.type !== 'mensalista_isento'")
replace_line(855, "p.type === 'mensalista'", "p.type && p.type.startsWith('mensalista')")
replace_line(1892, "item.type === 'mensalista'", "item.type && item.type.startsWith('mensalista')")
replace_line(2037, "p.type === 'mensalista'", "p.type && p.type.startsWith('mensalista')")
replace_line(2038, "=== 'goleiro'", "=== 'goleiro' || p.type === 'mensalista_isento'")
replace_line(2039, " !== 'goleiro'", " !== 'goleiro' && p.type !== 'mensalista_isento'")

with open('app.js', 'w', encoding='utf-8') as f:
    f.writelines(lines)
