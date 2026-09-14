// Throwaway spike: what can Runno's clangpp actually do?
import { runCode } from "@runno/sandbox";

const t = async (label, code, stdin = "", timeout = 60) => {
  const s = performance.now();
  let r;
  try {
    r = await runCode("clangpp", code, { stdin, timeout });
  } catch (e) {
    // compile errors surface as a thrown PrepareError
    r = { resultType: "compile_error", ...(e.data ?? { error: e.message }) };
    r.stderr = r.stderr?.replace(/\x1b\[[0-9;]*m/g, "");
  }
  const ms = Math.round(performance.now() - s);
  console.log(`--- ${label} (${ms}ms) type=${r.resultType} exit=${r.exitCode}`);
  if (r.stdout) console.log("stdout:", r.stdout.slice(0, 400));
  if (r.stderr) console.log("stderr:", r.stderr.slice(0, 700));
  if (r.error) console.log("error:", r.error);
};

const basic = `#include <iostream>
#include <stdexcept>
int main(){ long long a,b; std::cin>>a>>b; std::cout<<a+b<<"\\n";
 std::cout<<"clang "<<__clang_version__<<" cplusplus "<<__cplusplus<<"\\n";
 try { throw std::runtime_error("boom"); } catch (const std::exception& e) { std::cout<<"caught "<<e.what()<<"\\n"; }
 return 0; }`;

await t("basic cold", basic, "2 3\n");
await t("basic warm", basic, "40 2\n");
await t("bits/stdc++.h", `#include <bits/stdc++.h>
using namespace std;
int main(){vector<int> v{3,1,2}; sort(v.begin(),v.end()); cout<<v[0]<<v[1]<<v[2]<<endl;}`);
await t("c++17", `#include <iostream>
#include <optional>
#include <utility>
int main(){ std::optional<int> o=5; auto [p,q] = std::pair{1,2}; std::cout<<*o+p+q<<"\\n"; }`);
await t("c++20 ranges", `#include <iostream>
#include <ranges>
#include <vector>
int main(){ std::vector<int> v{1,2,3}; for(int x: v | std::views::transform([](int x){return x*x;})) std::cout<<x<<' '; }`);
await t("compile error", `int main(){ return x; }`);
await t("runtime error", `#include <vector>
int main(){ std::vector<int> v; return v.at(5); }`);
await t("infinite loop, 3s timeout", `int main(){ for(;;){} }`, "", 3);
await t("big input speed", `#include <bits/stdc++.h>
int main(){ std::ios::sync_with_stdio(false); std::cin.tie(nullptr); int n; std::cin>>n; long long s=0; for(int i=0;i<n;i++){int x; std::cin>>x; s+=x;} std::cout<<s<<"\\n"; }`,
  "200000\n" + Array.from({ length: 200000 }, (_, i) => i).join(" ") + "\n");
