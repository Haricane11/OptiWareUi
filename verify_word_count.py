import sys

def verify_word_counts(file_path):
    targets = {
        "Abstract": 130,
        "1. Introduction": 280,
        "2.1 Data Mining": 240,
        "2.2 Analysis Methods": 380,
        "2.3 Dataset": 150,
        "2.4 Data Preprocessing": 200,
        "3.1 Detailed Findings": 650,
        "3.2 Discussion": 260,
        "4. Conclusion": 230
    }
    
    with open(file_path, "r", encoding="utf-8") as f:
        lines = f.readlines()
        
    current_section = None
    section_words = {key: 0 for key in targets}
    
    for line in lines:
        if line.startswith("## ") or line.startswith("### "):
            stripped = line.strip("# \n")
            
            # Map headers to targets
            current_section = None
            for key in targets:
                if key in stripped:
                    current_section = key
                    break
        elif current_section:
            section_words[current_section] += len(line.split())
            
    passed_all = True
    out_lines = ["Section Word Count Verification:", "-" * 40]
    for section, target in targets.items():
        actual = section_words[section]
        diff = actual - target
        pct_diff = (diff / target) * 100
        
        status = "PASS"
        if pct_diff < -10:
            status = "FAIL (Too Short)"
            passed_all = False
            
        out_lines.append(f"{section:25} | Target: {target:4} | Actual: {actual:4} | Diff: {pct_diff:+6.1f}% | {status}")
        
    with open("verification.txt", "w", encoding="utf-8") as f:
        f.write("\n".join(out_lines))
        
    if not passed_all:
        sys.exit(1)

if __name__ == "__main__":
    verify_word_counts(sys.argv[1])
