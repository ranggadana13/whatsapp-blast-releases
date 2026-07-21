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
                
                // 1. Check if node is installed
                ProcessStartInfo checkNode = new ProcessStartInfo();
                checkNode.FileName = "node";
                checkNode.Arguments = "-v";
                checkNode.CreateNoWindow = true;
                checkNode.UseShellExecute = false;
                try
                {
                    using (Process p = Process.Start(checkNode))
                    {
                        p.WaitForExit();
                    }
                }
                catch
                {
                    MessageBox.Show("Node.js tidak terdeteksi di komputer Anda. Silakan instal Node.js terlebih dahulu!", "Error Launcher", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    return;
                }

                // 2. Start node server.js
                ProcessStartInfo serverInfo = new ProcessStartInfo();
                serverInfo.FileName = "cmd.exe";
                serverInfo.Arguments = "/c title WhatsApp Blast Server && node server.js";
                serverInfo.WorkingDirectory = projectDir;
                serverInfo.CreateNoWindow = false; 
                serverInfo.UseShellExecute = true;
                
                Process.Start(serverInfo);
                
                // 3. Wait for server to boot (3 seconds)
                Thread.Sleep(3000);
                
                // 4. Open default web browser
                Process.Start(new ProcessStartInfo("http://localhost:3000") { UseShellExecute = true });
            }
            catch (Exception ex)
            {
                MessageBox.Show("Gagal menjalankan launcher: " + ex.Message, "Error Launcher", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }
    }
}
