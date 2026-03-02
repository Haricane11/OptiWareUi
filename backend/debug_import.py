import traceback
try:
    import app.models
except Exception as e:
    with open('import_err.txt', 'w', encoding='utf-8') as f:
        f.write(traceback.format_exc())
