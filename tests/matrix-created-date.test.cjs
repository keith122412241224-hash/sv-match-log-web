/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict');

const {setup,findElement}=require('./server-page-fixture.cjs');
const {pages,state}=setup();
state.environments.forEach((environment,index)=>{environment.id=`00000000-0000-4000-8000-00000000010${index}`;});
const {renderToStaticMarkup}=require('react-dom/server');
test('member matrix omits supplementary labels across midnight and client clock changes in both scopes',async t=>{
 t.mock.timers.enable({apis:['Date'],now:new Date('2026-09-28T14:59:59.999Z')});
 for(const scope of [undefined,'all','mine'])for(const instant of ['2026-09-28T14:59:59.999Z','2026-09-28T15:00:00.000Z']){
  t.mock.timers.setTime(Date.parse(instant));
  const element=findElement(await pages.matrix({searchParams:Promise.resolve({scope})}),'MatchupMatrix');
  assert.ok(element);assert.equal(element.props.showSupplementaryInfo,false);
  for(const key of ['createdAtLabel','populationLabel','environmentName'])assert.equal(element.props[key],undefined);
  t.mock.timers.setTime(Date.parse('2030-01-01T00:00:00Z'));
  const html=renderToStaticMarkup(element);
  assert.doesNotMatch(html,/作成日|2030\/1\/1|対象登録戦績|登録戦績ベース|表示デッキの選択前/);
  assert.match(html,/>対面勝率表<\/h2>/);
 }
});
