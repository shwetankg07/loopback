package loopback;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.PrintStream;
import java.lang.reflect.InvocationTargetException;
import java.net.URL;
import java.net.URLClassLoader;

// Usage: Harness mkdir <dir>
//        Harness run <class dir> <main class> <time limit ms>
// Loads each program through a fresh class loader (no stale classes between compiles), feeds stdin from
// /str/stdin.txt, captures stdout to /files/stdout.txt, and writes ok / runtime_error / timeout to /files/status.txt.
public class Harness {
  public static void main(String[] a) throws Exception {
    if (a[0].equals("mkdir")) {
      new File(a[1]).mkdirs();
      return;
    }
    System.setIn(new BufferedInputStream(new FileInputStream("/str/stdin.txt")));
    PrintStream realOut = System.out;
    PrintStream out = new PrintStream(new BufferedOutputStream(new FileOutputStream("/files/stdout.txt"), 1 << 16), false);
    System.setOut(out);
    String status = "ok";
    Guard.expired = false;
    Guard.deadline = System.currentTimeMillis() + Long.parseLong(a[3]);
    try {
      ClassLoader loader = new URLClassLoader(new URL[] { new File(a[1]).toURI().toURL() }, Harness.class.getClassLoader());
      Class.forName(a[2], true, loader).getMethod("main", String[].class).invoke(null, (Object) new String[0]);
    } catch (Throwable e) {
      Throwable cause = e instanceof InvocationTargetException ? e.getCause() : e;
      Guard.Exit exit = find(cause, Guard.Exit.class);
      if (find(cause, Guard.TimeLimit.class) != null) {
        status = "timeout";
      } else if (exit != null) {
        if (exit.code != 0) {
          status = "runtime_error";
          System.err.println("Exit code " + exit.code);
        }
      } else {
        status = "runtime_error";
        cause.printStackTrace();
      }
    } finally {
      Guard.deadline = Long.MAX_VALUE;
      Guard.expired = false;
      out.flush();
      out.close();
      System.setOut(realOut);
    }
    FileOutputStream s = new FileOutputStream("/files/status.txt");
    s.write(status.getBytes());
    s.close();
  }

  static <T extends Throwable> T find(Throwable t, Class<T> type) {
    for (; t != null; t = t.getCause()) if (type.isInstance(t)) return type.cast(t);
    return null;
  }
}
