import importlib.util,pathlib,unittest
from unittest.mock import patch
p=pathlib.Path(__file__).with_name('collect-home-app-activity.py')
spec=importlib.util.spec_from_file_location('collector',p);c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c)
enroll_spec=importlib.util.spec_from_file_location('enrollment',p.with_name('enroll-home-app-activity.py'))
enrollment=importlib.util.module_from_spec(enroll_spec);enroll_spec.loader.exec_module(enrollment)
class ActivityTests(unittest.TestCase):
 def test_current_router_mac_corrects_roaming_address(self):
  original={'child':'joseph','device_id':'JBsGamingPC','mac':'60:dd:8e:d6:5f:38','target':'homeadmin@192.168.8.206','jump':'root@192.168.8.113'}
  snapshot={'clients':[{'hostname':'JBsGamingPC','mac':'60:DD:8E:D6:5F:38','ip':'192.168.110.206'}]}
  actual=enrollment.resolve_device_addresses([original],snapshot)[0]
  self.assertEqual(actual['target'],'homeadmin@192.168.110.206');self.assertEqual(actual['device_id'],'JBSGAMINGPC');self.assertEqual(original['target'],'homeadmin@192.168.8.206')
 def test_address_change_uses_matching_mac_and_private_valid_ip(self):
  original={'child':'norah','device_id':'NORAH-LAPTOP','mac':'70:08:94:96:02:45','target':'homeadmin@192.168.109.109','jump':'root@192.168.8.246'}
  for ip,mac in [('1.1.1.1',original['mac']),('bad-ip',original['mac']),('192.168.110.100','00:11:22:33:44:55')]:
   actual=enrollment.resolve_device_addresses([original],{'clients':[{'ip':ip,'mac':mac}]})[0]
   self.assertEqual(actual['target'],original['target'])
  actual=enrollment.resolve_device_addresses([original],{'clients':[{'ip':'192.168.110.109','mac':original['mac']}]})[0]
  self.assertEqual(actual['jump'],'root@192.168.8.113')

 def test_dry_install_does_not_connect_or_write(self):
  import tempfile,json,sys
  with tempfile.TemporaryDirectory() as folder:
   inventory=pathlib.Path(folder)/'devices.json';inventory.write_text(json.dumps([{'child':'chloe','device_id':'CHLOE-LAPTOP','target':'homeadmin@192.0.2.1'}]))
   state=pathlib.Path(folder)/'must-not-exist'
   with patch.object(sys,'argv',['collector','--devices',str(inventory),'--install','--dry-run','--state-dir',str(state)]), patch.object(c,'ssh') as connect, patch('builtins.print'):
    self.assertEqual(c.main(),0);connect.assert_not_called();self.assertFalse(state.exists())
 def test_blocked_computer_does_not_starve_other_enrollments(self):
  import tempfile,threading,sys,json
  barrier=threading.Barrier(2,timeout=5)
  def worker(device,state,digest,vault):
   barrier.wait()
   if device['child']=='norah':return {'device_id':device['device_id'],'enrolled':False,'error':'SSH unavailable'}
   return {'device_id':device['device_id'],'child':device['child'],'enrolled':True,'script_hash':digest}
  with tempfile.TemporaryDirectory() as folder:
   root=pathlib.Path(folder);inventory=root/'devices.json';inventory.write_text(json.dumps([{'child':'norah','device_id':'NORAH-LAPTOP'},{'child':'joseph','device_id':'JBSGAMINGPC'}]))
   with patch.object(sys,'argv',['enroll','--devices',str(inventory),'--state-dir',str(root/'state'),'--network-snapshot',str(root/'absent.json')]),patch.object(enrollment,'enroll_device',side_effect=worker),patch('builtins.print'):
    self.assertEqual(enrollment.main(),0)
   receipt=json.loads((root/'state/enrolled-devices.json').read_text())
   self.assertIn('JBSGAMINGPC',receipt);self.assertNotIn('NORAH-LAPTOP',receipt)
   results=json.loads((root/'state/last-enrollment.json').read_text());self.assertEqual(len(results),2)
 def test_windows_payload_is_encoded_and_compressed(self):
  import base64,re
  text=c.powershell("Write-Output '☃ $example'")
  wrapper=base64.b64decode(text.rsplit(' ',1)[1]).decode('utf-16le')
  self.assertNotIn('☃',wrapper)
  self.assertIn('GzipStream',wrapper)
 def test_resolves_universe_without_overwriting_observed_place(self):
  event={'title':'Roblox place 2','place_id':'2','metadata':{'universe_id':'1','evidence':'client_join_report'}}
  cache={'1':{'name':'Example game','root_place_id':'9'}}
  with patch.object(c.urllib.request,'urlopen') as fetch:
   c.resolve_games([event],cache)
   fetch.assert_not_called()
  self.assertEqual(event['title'],'Example game');self.assertEqual(event['place_id'],'2');self.assertEqual(event['metadata']['root_place_id'],'9')
 def test_empty_ssh_response_is_reported_as_protocol_failure(self):
  import argparse,subprocess
  result=subprocess.CompletedProcess([],0,stdout='',stderr='')
  with patch.object(c.subprocess,'run',return_value=result):
   with self.assertRaisesRegex(RuntimeError,'no structured response'):c.ssh(argparse.Namespace(ssh_config='/dev/null',jump=None),'homeadmin@192.0.2.1','@{}|ConvertTo-Json')
 def test_failed_ack_is_not_accepted(self):
  import io
  with patch.object(c.urllib.request,'urlopen',return_value=io.BytesIO(b'{"ok":false}')):
   with self.assertRaisesRegex(RuntimeError,'acknowledge'):c.post_events('https://example.com/api','test-token',[{}])
 def test_chunks_to_existing_ingest_limit(self):
  import io
  calls=[]
  def capture(request,**kwargs):
   import json
   calls.append(len(json.loads(request.data)['events']));return io.BytesIO(b'{"ok":true}')
  with patch.object(c.urllib.request,'urlopen',side_effect=capture):c.post_events('https://example.com/api','test-token',[{}]*1001)
  self.assertEqual(calls,[500,500,1])
if __name__=='__main__':unittest.main()
