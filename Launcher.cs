using System;
using System.Diagnostics;
using System.IO;
using System.Threading;
using System.Windows.Forms;

namespace WhatsAppBlastLauncher
{
    static class Program
    {
        [STAThread]
        static void Main()
        {
            try
            {
                string projectDir = AppDomain.CurrentDomain.BaseDirectory;
                
                // 1. Resolve Portable Node.js Executable Path
                string portableNode = Path.Combine(projectDir, "bin", "node.exe");
                string nodeExe = File.Exists(portableNode) ? portableNode : "node";

                // 2. Start Express & MongoDB Server SILENTLY (0% CMD Popup)
                ProcessStartInfo serverInfo = new ProcessStartInfo();
                serverInfo.FileName = nodeExe;
                serverInfo.Arguments = "server.js";
                serverInfo.WorkingDirectory = projectDir;
                serverInfo.CreateNoWindow = true; 
                serverInfo.WindowStyle = ProcessWindowStyle.Hidden;
                serverInfo.UseShellExecute = false;
                
                Process.Start(serverInfo);
                
                // 3. Wait for server to boot (3.5 seconds)
                Thread.Sleep(3500);
                
                // 4. Open Application UI in Standalone Desktop App Window Mode (No Address Bar & No Tabs)
                ProcessStartInfo appInfo = new ProcessStartInfo();
                appInfo.FileName = "cmd.exe";
                appInfo.Arguments = "/c start msedge --app=http://localhost:3000 || start chrome --app=http://localhost:3000 || start http://localhost:3000";
                appInfo.CreateNoWindow = true;
                appInfo.WindowStyle = ProcessWindowStyle.Hidden;
                appInfo.UseShellExecute = false;

                Process.Start(appInfo);
            }
            catch (Exception ex)
            {
                MessageBox.Show("Gagal menjalankan launcher: " + ex.Message, "Error Launcher", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }
    }
}
