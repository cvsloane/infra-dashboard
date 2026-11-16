import importlib.util,pathlib,unittest
from unittest.mock import patch
p=pathlib.Path(__file__).with_name('collect-home-app-activity.py')
spec=importlib.util.spec_from_file_location('collector',p);c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c)
class ActivityTests(unittest.TestCase):
 def test_dry_install_does_not_connect_or_write(self):
  import tempfile,json,sys
  with tempfile.TemporaryDirectory() as folder:
   inventory=pathlib.Path(folder)/'devices.json';inventory.write_text(json.dumps([{'child':'chloe','device_id':'CHLOE-LAPTOP','target':'homeadmin@192.0.2.1'}]))
   state=pathlib.Path(folder)/'must-not-exist'
   with patch.object(sys,'argv',['collector','--devices',str(inventory),'--install','--dry-run','--state-dir',str(state)]), patch.object(c,'ssh') as connect, patch('builtins.print'):
    self.assertEqual(c.main(),0);connect.assert_not_called();self.assertFalse(state.exists())
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
