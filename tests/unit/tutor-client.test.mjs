import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = file => readFileSync(new URL('../../' + file, import.meta.url), 'utf8');
function client(reply = { ok: true }) {
  const sent = [];
  const window = {
    APP_INSTANCE: { GATEWAY_URL: 'https://qa.test/' },
    fetch: async (url, opt = {}) => {
      sent.push({ url: String(url), ...opt });
      return Response.json(reply);
    }
  };
  vm.runInNewContext(read('services/gateway-client.js'), { window, URL, Error });
  return { api: window.GatewayClient, sent };
}

test('Tutor: crea PR de varios alumnos sin inventar un requestId comun', async () => {
  const { api, sent } = client({ok:true,results:[{studentId:'S1',result:'CREATED'},{studentId:'S2',result:'CREATED'}]});
  const results=await api.createPickupRequests({tutorId:'T1',studentIds:['S1','S2'],mode:'GPS',distanceMeters:80});
  assert.equal(results.results.length,2);
  assert.equal(sent.length,1);
  assert.equal(sent[0].url,'https://qa.test/api/pickup-requests');
  assert.deepEqual(JSON.parse(sent[0].body).studentIds,['S1','S2']);
});

test('Tutor: no solicita PR si no hay alumnos y no hace red', async () => {
  const {api,sent}=client();
  await assert.rejects(api.createPickupRequests({tutorId:'T1',studentIds:[],mode:'GPS'}),/studentIds/);
  assert.equal(sent.length,0);
});

test('Tutor: consulta estados y GPS con IDs de PR separados', async () => {
  const {api,sent}=client();
  await api.pickupStatus('T1',['R1','R2']);
  await api.updatePickupGps('T1',['R1','R2'],35);
  assert.equal(sent[0].url,'https://qa.test/api/pickup-requests/status');
  assert.equal(sent[1].url,'https://qa.test/api/pickup-requests/gps');
  assert.deepEqual(JSON.parse(sent[0].body).requestIds,['R1','R2']);
  assert.equal(JSON.parse(sent[1].body).distanceMeters,35);
});

test('Tutor: propaga errores de autorizacion sin declararlos como exito', async () => {
  const {api}=client({ok:false,error:'NOT_AUTHORIZED'});
  await assert.rejects(api.createPickupRequests({tutorId:'T1',studentIds:['S1'],mode:'ETA',etaMinutes:5}),
    e=>e.code==='NOT_AUTHORIZED');
});

test('Tutor: contrato de tiempo elimina timestamps de lifecycle enviados por el cliente', async () => {
  const calls=[];
  const window={
    TUTOR_EXPERIENCE_CONFIG: {locale:'es-MX',timeZone:'America/Mexico_City'},
    fetch: async (url,opt={})=>{calls.push({url,opt});return Response.json({ok:true});}
  };
  vm.runInNewContext(read('pickup-time-contract.js'),{window,Intl,Date,console,Set});
  assert.equal(window.NexusPickupTime.isUtcZ('2026-10-20T18:00:00Z'),true);
  assert.equal(window.NexusPickupTime.isUtcZ('2026-10-20T12:00:00-06:00'),false);
  await window.fetch('https://qa.test/api/pickup-requests',{method:'POST',
    body:JSON.stringify({studentIds:['S1'],requestedAt:'2020-01-01T00:00:00Z',distanceMeters:70})});
  const body=JSON.parse(calls[0].opt.body);
  assert.equal(body.requestedAt,undefined);
  assert.equal(body.distanceMeters,70);
});
