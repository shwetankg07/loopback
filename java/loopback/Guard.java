package loopback;

// Compile.java puts a call to tick() at the top of every loop body in the user's program, and turns
// System.exit(x) into exit(x). CheerpJ runs Java on the page's main thread, so this is what stops a stuck loop.
public final class Guard {
  public static final class TimeLimit extends Error {
    public TimeLimit() { super("Time limit exceeded", null, false, false); }
  }

  public static final class Exit extends Error {
    public final int code;
    public Exit(int code) { super(null, null, false, false); this.code = code; }
  }

  public static long deadline = Long.MAX_VALUE;
  public static boolean expired;
  private static int n;

  // Reads the clock once every 16k iterations. Once expired, every call throws, otherwise a catch (Throwable)
  // around an inner loop could swallow the single throw and spin forever.
  public static void tick() {
    if (expired || ((++n & 0x3FFF) == 0 && System.currentTimeMillis() > deadline)) {
      expired = true;
      throw new TimeLimit();
    }
  }

  public static void exit(int code) { throw new Exit(code); }
}
