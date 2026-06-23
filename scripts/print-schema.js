const fs=require('fs');const path=require('path');console.log(fs.readFileSync(path.join(__dirname,'..','migrations','001_real_backend_schema.sql'),'utf8'));
