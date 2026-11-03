; ecx=crc rdx=p r8=n
.code
crc32c_hw PROC
        mov     eax, ecx
        not     eax
        mov     r9, r8
        shr     r9, 3
        jz      tail
qloop:
        crc32   rax, qword ptr [rdx]
        add     rdx, 8
        dec     r9
        jnz     qloop
tail:
        and     r8, 7
        jz      done
bloop:
        crc32   eax, byte ptr [rdx]
        inc     rdx
        dec     r8
        jnz     bloop
done:
        not     eax
        ret
crc32c_hw ENDP
END
