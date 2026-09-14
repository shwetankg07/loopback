package loopback;

import com.sun.source.util.JavacTask;
import com.sun.source.util.TaskEvent;
import com.sun.source.util.TaskListener;
import com.sun.tools.javac.api.JavacTaskImpl;
import com.sun.tools.javac.api.JavacTool;
import com.sun.tools.javac.tree.JCTree;
import com.sun.tools.javac.tree.JCTree.*;
import com.sun.tools.javac.tree.TreeMaker;
import com.sun.tools.javac.tree.TreeTranslator;
import com.sun.tools.javac.util.List;
import com.sun.tools.javac.util.Names;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.util.Arrays;
import javax.tools.StandardJavaFileManager;

// javac (JDK 8, from tools.jar) with a parse-time tree rewrite: every loop body becomes { loopback.Guard.tick(); body }
// and System.exit(x) becomes loopback.Guard.exit(x). Line numbers and error messages stay exactly as written.
// Usage: Compile <source.java> <output dir> <classpath containing loopback.Guard>
// Writes "ok" or "fail" to /files/compile.txt; errors go to stderr in javac's usual format.
public class Compile {
  public static void main(String[] a) throws Exception {
    write("/files/compile.txt", "fail");
    JavacTool tool = JavacTool.create();
    StandardJavaFileManager fm = tool.getStandardFileManager(null, null, null);
    JavacTask task = tool.getTask(null, fm, null, Arrays.asList("-d", a[1], "-cp", a[2], "-nowarn"), null,
        fm.getJavaFileObjects(new File(a[0])));
    final TreeMaker make = TreeMaker.instance(((JavacTaskImpl) task).getContext());
    final Names names = Names.instance(((JavacTaskImpl) task).getContext());

    final TreeTranslator guard = new TreeTranslator() {
      JCExpression qualified(String... parts) {
        JCExpression e = make.Ident(names.fromString(parts[0]));
        for (int i = 1; i < parts.length; i++) e = make.Select(e, names.fromString(parts[i]));
        return e;
      }

      JCStatement guarded(JCStatement body) {
        make.at(body.pos);
        JCStatement tick = make.Exec(make.Apply(List.<JCExpression>nil(), qualified("loopback", "Guard", "tick"), List.<JCExpression>nil()));
        return make.Block(0, List.of(tick, body));
      }

      public void visitWhileLoop(JCWhileLoop t) { super.visitWhileLoop(t); t.body = guarded(t.body); result = t; }
      public void visitDoLoop(JCDoWhileLoop t) { super.visitDoLoop(t); t.body = guarded(t.body); result = t; }
      public void visitForLoop(JCForLoop t) { super.visitForLoop(t); t.body = guarded(t.body); result = t; }
      public void visitForeachLoop(JCEnhancedForLoop t) { super.visitForeachLoop(t); t.body = guarded(t.body); result = t; }

      public void visitApply(JCMethodInvocation t) {
        super.visitApply(t);
        if (t.meth instanceof JCFieldAccess) {
          JCFieldAccess f = (JCFieldAccess) t.meth;
          if (f.name.toString().equals("exit") && f.selected instanceof JCIdent && ((JCIdent) f.selected).name.toString().equals("System")) {
            make.at(t.meth.pos);
            t.meth = qualified("loopback", "Guard", "exit");
          }
        }
        result = t;
      }
    };

    task.addTaskListener(new TaskListener() {
      public void started(TaskEvent e) {}
      public void finished(TaskEvent e) {
        if (e.getKind() == TaskEvent.Kind.PARSE) guard.translate((JCTree) e.getCompilationUnit());
      }
    });
    if (task.call()) write("/files/compile.txt", "ok");
  }

  static void write(String path, String s) throws IOException {
    FileOutputStream f = new FileOutputStream(path);
    f.write(s.getBytes());
    f.close();
  }
}
