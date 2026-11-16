/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict');

const {setup,findElement}=require('./server-page-fixture.cjs');
const {pages,state}=setup();
state.environments.forEach((environment,index)=>{environment.id=`00000000-0000-4000-8000-00000000010${index}`;});
const {renderToStaticMarkup}=require('react-dom/server');
test('matrix supplies the JST server date to rendered output across midnight regardless of client clock',async t=>{
 t.mock.timers.enable({apis:['Date'],now:new Date('2026-09-28T14:59:59.999Z')});
 for(const scope of [undefined,'mine'])for(const [instant,expected]of [['2026-09-28T14:59:59.999Z','2026/9/28'],['2026-09-28T15:00:00.000Z','2026/9/29']]){
  t.mock.timers.setTime(Date.parse(instant));
  const element=findElement(await pages.matrix({searchParams:Promise.resolve({scope})}),'MatchupMatrix');
  assert.ok(element);assert.equal(element.props.createdAtLabel,expected);
  t.mock.timers.setTime(Date.parse('2030-01-01T00:00:00Z'));
  const html=renderToStaticMarkup(element);
  assert.ok(html.includes('作成日 '+expected));assert.ok(!html.includes('2030/1/1'));
 }
});
