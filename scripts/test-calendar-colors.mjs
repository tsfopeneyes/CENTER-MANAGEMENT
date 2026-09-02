import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { saveCalendarCategory } from '../src/api/calendarCategoriesApi.js';
import { COLOR_THEMES, getProgramCalendarCategories, getCalendarEventTheme, getColorTheme } from '../src/utils/calendarColors.js';

// Exercise writes against an isolated DB with the existing table constraints.
const db = new PGlite();
try {
    await db.exec(`CREATE TABLE calendar_categories (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL UNIQUE, color_theme text NOT NULL DEFAULT 'blue', is_system boolean DEFAULT false);
        INSERT INTO calendar_categories(name,color_theme,is_system) VALUES ('공간 대여','purple',true),('휴관','gray',true);`);
    const client = { from(table) {
        assert.equal(table, 'calendar_categories');
        let payload, insert = false, filters=[];
        const query = {
            insert(rows) { payload=rows[0];insert=true;return query; },
            update(row) { payload=row;return query; },
            eq(key,value) { assert.ok(['id','color_theme'].includes(key)); filters.push([key,value]);return query; },
            async select() {
                try {
                    const result = insert
                        ? await db.query('INSERT INTO calendar_categories(name,color_theme,is_system) VALUES ($1,$2,$3) RETURNING *', [payload.name,payload.color_theme,payload.is_system??false])
                        : await db.query(`UPDATE calendar_categories SET name=$1,color_theme=$2 WHERE ${filters.map(([key],i)=>`${key}=$${i+3}`).join(' AND ')} RETURNING *`,[payload.name,payload.color_theme,...filters.map(([,value])=>value)]);
                    return {data:result.rows,error:null};
                } catch (error) {return {data:null,error};}
            },
        };return query;
    }};
    const read = async () => (await db.query('SELECT * FROM calendar_categories ORDER BY name')).rows;
    const original = await read();
    const defaults = getProgramCalendarCategories(original);
    assert.equal(defaults[0].color_theme,'pink');assert.equal(defaults[1].color_theme,'purple');
    assert.deepEqual(await read(),original,'default colors must not create rows');
    const center = await saveCalendarCategory(client,{name:'무시할 이름',color_theme:'teal'},defaults[0]);
    await saveCalendarCategory(client,{name:defaults[1].name,color_theme:'amber'},defaults[1]);
    let categories=await read();
    assert.equal(center.name,'센터 프로그램');assert.equal(center.is_system,true);
    assert.deepEqual(categories.filter(row=>original.some(old=>old.id===row.id)),original);
    const [editing]=getProgramCalendarCategories(categories);
    const saved=await saveCalendarCategory(client,{name:editing.name,color_theme:'sky'},editing);
    assert.equal(saved.id,center.id,'repeated edits update the existing category');
    await assert.rejects(saveCalendarCategory(client,{name:editing.name,color_theme:'red'},editing),/저장되지/,'stale writes must not overwrite');
    await assert.rejects(saveCalendarCategory(client,{name:defaults[0].name,color_theme:'red'},defaults[0]),/이미/,'simultaneous first save must not duplicate');
    await assert.rejects(saveCalendarCategory(client,{name:'스처 프로그램',color_theme:'blue'},null),/기본 프로그램/);
    await assert.rejects(saveCalendarCategory(client,{name:'외부',color_theme:'unknown'},null),/색상/);
    assert.equal(Object.keys(COLOR_THEMES).length,20);
    for (const key of Object.keys(COLOR_THEMES)) {
        await saveCalendarCategory(client,{name:`색상-${key}`,color_theme:key},null);
    }
    categories=await read();
    for(const [program_type,key] of [['CENTER','sky'],['SCHOOL_CHURCH','amber']]) {
        const raw={program_type};
        assert.equal(getCalendarEventTheme({isPublic:true,raw},categories),COLOR_THEMES[key]);
        assert.equal(getCalendarEventTheme({type:'PROGRAM',raw},categories),COLOR_THEMES[key]);
    }
    const rental=categories.find(row=>row.name==='공간 대여');
    assert.equal(getCalendarEventTheme({type:'RENTAL',raw:{category_id:'RENTAL'}},categories),getCalendarEventTheme({category_id:rental.id},categories));
    assert.equal(getColorTheme('unknown'),COLOR_THEMES.gray);
    assert.equal(getColorTheme('__proto__'),COLOR_THEMES.gray);
    console.log('PASS: 20 palettes; saved program colors; shared admin/student mapping; existing rows preserved; duplicate/stale/invalid writes rejected.');
} finally {await db.close();}
