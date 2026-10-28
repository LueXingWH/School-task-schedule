param([ValidateSet('Save','Restore')][string]$Mode,[string]$Path)
$ErrorActionPreference='Stop'
$subkeys=@('Software\Google\Chrome\NativeMessagingHosts\com.xiaoshijian.mcp','Software\Microsoft\Edge\NativeMessagingHosts\com.xiaoshijian.mcp')
if($Mode -eq 'Save'){
  $entries=@()
  foreach($view in @('Registry32','Registry64')){
    $root=[Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::CurrentUser,[Microsoft.Win32.RegistryView]::$view)
    try{foreach($subkey in $subkeys){$key=$root.OpenSubKey($subkey);try{$entries+=@{view=$view;key=$subkey;exists=($null -ne $key);value=$(if($key){$key.GetValue('',$null)}else{$null})}}finally{if($key){$key.Dispose()}}}}finally{$root.Dispose()}
  }
  ConvertTo-Json -InputObject $entries | Set-Content -LiteralPath $Path -Encoding utf8
}else{
  $entries=Get-Content -Raw -LiteralPath $Path | ConvertFrom-Json
  foreach($entry in $entries){
    if($subkeys -notcontains $entry.key -or @('Registry32','Registry64') -notcontains $entry.view){throw 'Invalid native registry snapshot'}
    $root=[Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::CurrentUser,[Microsoft.Win32.RegistryView]::$($entry.view))
    try{
      if($entry.exists){$key=$root.CreateSubKey($entry.key);try{if($null -ne $entry.value){$key.SetValue('',$entry.value,[Microsoft.Win32.RegistryValueKind]::String)}else{$key.DeleteValue('',$false)}}finally{$key.Dispose()}}
      else{$root.DeleteSubKey($entry.key,$false)}
    }finally{$root.Dispose()}
  }
}
